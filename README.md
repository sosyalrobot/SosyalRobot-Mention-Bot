# SosyalRobot Mention Bot

Free X mention reply bot for `@SosyalRobot` using:
- GitHub Actions for scheduling
- X API for mentions and replies
- Groq for short funny Turkish responses

## Files
- `bot.js` - main bot logic
- `.github/workflows/bot.yml` - GitHub Actions schedule
- `.env.example` - required secrets/variables
- `state.json` - processed mention tracking

## Setup
1. Create a GitHub repo and upload these files.
2. Add repo secrets in **Settings > Secrets and variables > Actions**.
3. Start with `DRY_RUN=true`.
4. Run the workflow manually once.
5. If logs look good, set `DRY_RUN=false`.

## Required GitHub Secrets
- `X_APP_KEY`
- `X_APP_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_SECRET`
- `X_BEARER_TOKEN`
- `X_USER_ID`
- `BOT_USERNAME`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `DRY_RUN`
- `MAX_REPLIES_PER_RUN`
- `USER_COOLDOWN_HOURS`

## Notes
- Replies only to mentions.
- Skips already processed mentions.
- Has basic spam and safety filters.
- Commits `state.json` back to the repo after each run.
