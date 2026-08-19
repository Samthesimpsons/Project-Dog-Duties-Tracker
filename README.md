# 🐶 Dog Bowl Bot and Bathing

Telegram bot on Vercel's free tier. An application for my own use.

- Every morning at **9 AM (Singapore)**: checklist to wash the water + food bowls.
- Every **Saturday 9 AM (Singapore)**: checklist to bath the dog.

## Commands

| Command   | What it does                                          |
|-----------|-------------------------------------------------------|
| `/status` | % of days bowls washed & weeks dog bathed / missed     |
| `/bowls`  | Summon today's bowl checklist on demand               |
| `/bath`   | Summon this week's bath checklist on demand           |
| `/id`     | Show your chat id (setup only)                        |

`/status` example:

```
📊 Last 30 day(s) (since 2026-07-20)

Bowls washed: 26/30 days
█████████░ 87% done
Missed: 4 days (13%)

🛁 Baths done: 4/5 weeks
████████░░ 80% done
Missed: 1 weeks (20%)
```

## Setup

### 1. Create the bot (Telegram)
1. Open **@BotFather** > `/newbot` > pick a display name and a username ending in `bot`.
2. Copy the token it gives you (`1234567890:AAF...`): this is `TELEGRAM_BOT_TOKEN`.
3. Optional: `/setcommands` > pick your bot > paste:
   ```
   status - Bowl and bath completion stats
   bowls - Today's bowl checklist
   bath - This week's bath checklist
   id - Show chat id
   ```

### 2. Deploy to Vercel
1. Push this repo to GitHub, then [vercel.com/new](https://vercel.com/new) > import it.
2. Framework preset **Other**; leave Build / Output / Install commands empty.
3. Add environment variables (Production is enough), then **Deploy**:

| Key                       | Value                                                        |
|---------------------------|--------------------------------------------------------------|
| `TELEGRAM_BOT_TOKEN`      | from BotFather                                               |
| `TELEGRAM_WEBHOOK_SECRET` | any random string: `openssl rand -hex 16`                   |
| `TELEGRAM_CHAT_ID`        | leave empty for now (step 5)                                 |
| `TZ_OFFSET_HOURS`         | `8` for Singapore (`-4` NY summer, etc.)                     |
| `LEFTHOOK`                | `0`: skips git-hook install during Vercel's `npm install`   |
| `CRON_SECRET`             | any random string: `openssl rand -hex 16`                   |

`CRON_SECRET` is **not** created by Vercel: you must add it yourself. Vercel then sends it as `Authorization: Bearer <CRON_SECRET>` on every cron call; without it the cron endpoints answer 401 and no reminder is sent.

### 3. Database (Turso, free)
Vercel project > **Storage** > Browse Marketplace > **Turso Cloud** > create DB.
- Region: match your Vercel function region (Hobby default is US East / `iad1`).
- Connect to project: environment **Production**, no DB branches, **prefix `TURSO`** (the code reads `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`).
- Redeploy: **Deployments > ⋯ > Redeploy** so the new vars are picked up.

Tables are created automatically on first use: no migrations.

### 4. Register the webhook
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<PROJECT>.vercel.app/api/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```
Expect `{"ok":true, ... "Webhook was set"}`.

### 5. Lock the bot to you
1. Open your bot in Telegram, press Start, send `/id` > it replies with a number.
2. Vercel > **Settings > Environment Variables** > edit `TELEGRAM_CHAT_ID` > paste it.
3. Redeploy again.

### 6. Verify
- `/bowls` > checklist appears; tapping buttons toggles ✅ and adds 🎉 when both done.
- `/status` > stats.
- Vercel > **Settings > Cron Jobs** lists `/api/cron/bowls` and `/api/cron/bath`; use *Run* there to fire one manually.
- Problems? Check **Logs** for `/api/webhook`: a 401 means the webhook secret doesn't match; no logs at all means the webhook URL is wrong.

## Lost or leaked secrets? Rotate them

**Bot token**: BotFather > `/mybots` > pick the bot > **API Token** > **Revoke current token**. The old token stops working immediately; copy the new one into Vercel (`TELEGRAM_BOT_TOKEN`), redeploy, then re-run the `setWebhook` curl from step 4 with the new token (revoking clears the webhook).

**Webhook secret**: it's just a string you invented, so make a new one (`openssl rand -hex 16`), update `TELEGRAM_WEBHOOK_SECRET` in Vercel, redeploy, then re-run the `setWebhook` curl with the new `secret_token`. Until both sides match, the bot returns 401 and ignores messages.

**Chat id**: not secret; just send `/id` again. Note it only answers your locked chat, so from another account you'd first clear `TELEGRAM_CHAT_ID`.

**Turso token**: Vercel > Storage > the DB > regenerate / reconnect; it rewrites `TURSO_AUTH_TOKEN` for you. Redeploy.

## Reminder times (`vercel.json`, UTC only)
Set for Singapore (UTC+8): `0 1 * * *` = 9 AM daily (bowls), `0 1 * * 6` = Sat 9 AM (bath). Free-plan crons fire within the hour.

## Development

```bash
npm install        # also installs the git pre-commit hook (lefthook)
npm test           # unit tests (Node built-in runner, in-memory DB, mocked Telegram)
npm run lint       # Biome lint + format check
npm run fix        # Biome auto-fix
npm run check      # lint + test: same as the pre-commit hook
```

Tooling: [Biome](https://biomejs.dev) for lint/format (`biome.json`) and [lefthook](https://lefthook.dev) for git hooks (`lefthook.yml`). The pre-commit hook formats staged files and runs the tests; bypass once with `git commit -n`.
