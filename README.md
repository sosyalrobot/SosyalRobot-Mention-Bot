# SosyalRobot Mention Bot

GitHub Actions üzerinde çalışan, sadece `@SosyalRobot` mention'larını kontrol edip Türkçe mention'lara kısa ve komik yanıt veren basit bot.

## Özellikler
- Sadece mention'lara cevap verir
- Türkçe filtre
- Günlük cevap limiti
- Kullanıcı başı cooldown
- Dry run desteği
- Groq ile tutarlı SosyalRobot tonu

## Gerekli GitHub Secrets
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
- `MAX_REPLIES_PER_DAY`
- `USER_COOLDOWN_HOURS`

## Önerilen başlangıç
- `DRY_RUN=true`
- `MAX_REPLIES_PER_RUN=1`
- `MAX_REPLIES_PER_DAY=8`
- `USER_COOLDOWN_HOURS=24`

## Çalıştırma
1. Repo'ya dosyaları yükle
2. GitHub Secrets değerlerini ekle
3. Actions sekmesinden workflow'u manuel çalıştır
4. Logları kontrol et
5. Her şey iyiyse `DRY_RUN=false` yap
