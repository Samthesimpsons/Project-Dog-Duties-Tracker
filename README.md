# 🐶 Dog Bowl Bot and Bathing

Telegram bot on Vercel's free tier. An application for my own use.

- Every night at **9 PM (Singapore)**: checklist to wash the water + food bowls.
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

## Development

```bash
npm install        # also installs the git pre-commit hook (lefthook)
npm test           # unit tests (Node built-in runner, in-memory DB, mocked Telegram)
npm run lint       # Biome lint + format check
npm run fix        # Biome auto-fix
npm run check      # lint + test — same as the pre-commit hook
```

Tooling: [Biome](https://biomejs.dev) for lint/format (`biome.json`) and [lefthook](https://lefthook.dev) for git hooks (`lefthook.yml`). The pre-commit hook formats staged files and runs the tests; bypass once with `git commit -n`.
