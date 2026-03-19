import fs from "fs";
import path from "path";
import { TwitterApi } from "twitter-api-v2";

const STATE_FILE = path.resolve("state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      processedMentionIds: [],
      repliedUserCooldowns: {},
      lastRunAt: null
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function uniqueKeepRecent(arr, max = 1000) {
  return [...new Set(arr)].slice(-max);
}

function nowTs() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBotMention(text, botUsername) {
  const re = new RegExp(`@${botUsername}\\b`, "ig");
  return normalizeText((text || "").replace(re, ""));
}

function looksUnsafe(text) {
  const t = (text || "").toLowerCase();

  const blocked = [
    "sex", "seks", "çıplak", "nud", "nude", "nsfw",
    "politic", "siyaset", "cumhurbaşkanı", "president",
    "ırk", "race", "religion", "din", "attack", "suicide",
    "intihar", "bomb", "weapon", "silah", "threat", "tehdit"
  ];

  return blocked.some(word => t.includes(word));
}

function isLikelySpam(text) {
  const t = text || "";
  const urlCount = (t.match(/https?:\/\//g) || []).length;
  const mentionCount = (t.match(/@\w+/g) || []).length;
  return urlCount >= 2 || mentionCount >= 5;
}

function fallbackReply(cleanText) {
  const pool = [
    "Bunu sistem not aldı. Hafif kaos, iyi enerji.",
    "SosyalRobot raporu: mention geldi, cevap üretildi.",
    "Bu mention bana çay koydurttu.",
    "Durum analizi tamam: tatlı bir karışıklık var.",
    "Algoritmik olarak güldüm sayılır.",
    "Sistemde titreşim var, cevap bırakıyorum.",
    "Bu mesaj resmi olarak ilginç bulundu.",
    "Robot konseyi bunu onayladı."
  ];

  if (!cleanText) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const short = cleanText.slice(0, 80);
  return `Not edildi: "${short}" ... sistem bunu hafif dramatik buldu.`;
}

async function generateGroqReply(inputText) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  if (!apiKey) return fallbackReply(inputText);

  const prompt = `
Sen @SosyalRobot için kısa, komik ama güvenli bir X yanıt yazan asistansın.

Kurallar:
- Türkçe yaz.
- 1 cümle olsun.
- Maksimum 180 karakter.
- Kısa, esprili, hafif alaycı ama saldırgan değil.
- Küfür, hakaret, siyaset, cinsellik, tehdit, nefret, taciz yok.
- Emoji kullanma.
- Çok zorlama olmasın.
- Mention içeriğini birebir tekrar etme.
- Gereksiz hashtag kullanma.
- Sadece yanıt metnini döndür.

Mention:
${inputText || "(boş)"}
`.trim();

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: "Kısa, komik, güvenli sosyal medya yanıtları üret."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Groq error:", errText);
    return fallbackReply(inputText);
  }

  const data = await res.json();
  let text = data?.choices?.[0]?.message?.content?.trim() || fallbackReply(inputText);

  text = text.replace(/^["'\s]+|["'\s]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > 180) {
    text = text.slice(0, 177).trimEnd() + "...";
  }

  return text || fallbackReply(inputText);
}

async function main() {
  const required = [
    "X_APP_KEY",
    "X_APP_SECRET",
    "X_ACCESS_TOKEN",
    "X_ACCESS_SECRET",
    "X_BEARER_TOKEN",
    "X_USER_ID",
    "BOT_USERNAME"
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
  const MAX_REPLIES_PER_RUN = Number(process.env.MAX_REPLIES_PER_RUN || 5);
  const USER_COOLDOWN_HOURS = Number(process.env.USER_COOLDOWN_HOURS || 12);

  const state = loadState();

  const rwClient = new TwitterApi({
    appKey: process.env.X_APP_KEY,
    appSecret: process.env.X_APP_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET
  }).readWrite;

  const roClient = new TwitterApi(process.env.X_BEARER_TOKEN).readOnly;

  const userId = process.env.X_USER_ID;
  const botUsername = process.env.BOT_USERNAME.replace(/^@/, "");

  const mentions = await roClient.v2.userMentionTimeline(userId, {
    expansions: ["author_id"],
    "tweet.fields": [
      "author_id",
      "conversation_id",
      "created_at",
      "referenced_tweets",
      "text"
    ],
    "user.fields": ["username"],
    max_results: 10
  });

  const tweetMap = mentions?.data?.data || [];
  const includesUsers = mentions?.includes?.users || [];
  const userMap = new Map(includesUsers.map(u => [u.id, u]));

  if (!tweetMap.length) {
    console.log("No mentions found.");
    state.lastRunAt = nowTs();
    saveState(state);
    return;
  }

  const candidates = tweetMap
    .slice()
    .reverse()
    .filter(tweet => {
      if (!tweet?.id) return false;
      if (state.processedMentionIds.includes(tweet.id)) return false;
      if (!tweet.author_id) return false;
      if (tweet.author_id === userId) return false;

      const text = tweet.text || "";
      if (looksUnsafe(text)) return false;
      if (isLikelySpam(text)) return false;

      const refs = tweet.referenced_tweets || [];
      const isRetweet = refs.some(r => r.type === "retweeted");
      if (isRetweet) return false;

      const author = userMap.get(tweet.author_id);
      const username = author?.username?.toLowerCase();
      const cooldownUntil = state.repliedUserCooldowns[tweet.author_id];

      if (cooldownUntil && Date.now() < cooldownUntil) {
        console.log(`Cooldown skip for @${username || tweet.author_id}`);
        return false;
      }

      return true;
    })
    .slice(0, MAX_REPLIES_PER_RUN);

  console.log(`Found ${tweetMap.length} mentions, replying to ${candidates.length}.`);

  for (const tweet of candidates) {
    const author = userMap.get(tweet.author_id);
    const username = author?.username || "user";
    const cleanText = stripBotMention(tweet.text, botUsername);

    let replyText = await generateGroqReply(cleanText);

    if (!replyText || replyText.length < 3) {
      replyText = fallbackReply(cleanText);
    }

    if (replyText.length > 180) {
      replyText = replyText.slice(0, 177).trimEnd() + "...";
    }

    console.log(`Mention ${tweet.id} from @${username}`);
    console.log(`Reply: ${replyText}`);

    if (!DRY_RUN) {
      await rwClient.v2.reply(replyText, tweet.id);
      await sleep(1500);
    }

    state.processedMentionIds.push(tweet.id);
    state.processedMentionIds = uniqueKeepRecent(state.processedMentionIds, 1000);

    state.repliedUserCooldowns[tweet.author_id] =
      Date.now() + USER_COOLDOWN_HOURS * 60 * 60 * 1000;
  }

  state.lastRunAt = nowTs();
  saveState(state);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
