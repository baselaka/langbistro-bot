# LangBistro

A voice-first, AI-powered language learning Telegram bot. LangBistro delivers daily vocabulary, fill-in-the-blank quizzes, and text-to-speech pronunciation — all inside Telegram, no app download required.

**Supported languages:** Spanish 🇪🇸 · French 🇫🇷

**Try it:** [@LangBistroBot](https://t.me/LangBistroBot)

---

## Features

- 📚 10 new words delivered daily, ranked by real-world frequency
- 🎧 Text-to-speech pronunciation for every word (OpenAI TTS)
- ✏️ AI-generated fill-in-the-blank quizzes
- 🎤 Voice message support (Whisper transcription)
- 📈 Progress tracking across 5 vocabulary tiers
- 💳 Freemium model with Paddle subscription paywall

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Bot framework | [GrammY](https://grammy.dev/) (Node.js / TypeScript) |
| Database | [Supabase](https://supabase.com/) (Postgres) |
| AI | OpenAI GPT-4o, Whisper, TTS |
| Payments | [Paddle](https://paddle.com/) |
| Hosting | [Railway](https://railway.app/) |
| Vocabulary | [OpenSubtitles frequency lists](https://github.com/hermitdave/FrequencyWords) (CC BY 4.0) |

---

## Self-Hosting

### Prerequisites

- Node.js 18+
- A Telegram bot token ([create one via @BotFather](https://t.me/botfather))
- A Supabase project
- An OpenAI API key
- A Paddle account (optional — required only for payments)

### 1. Clone the repo

```bash
git clone https://github.com/baselaka/langbistro-bot.git
cd langbistro-bot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. See `.env.example` for the full list of required variables.

Key variables:

```
TELEGRAM_BOT_TOKEN=       # from @BotFather
OPENAI_API_KEY=           # from platform.openai.com
SUPABASE_URL=             # your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY= # from Supabase project settings
PADDLE_API_KEY=           # from Paddle dashboard (optional)
PADDLE_WEBHOOK_SECRET=    # from Paddle webhook settings (optional)
```

### 3. Set up the database

Run the schema migration against your Supabase project:

```bash
# Apply schema
psql $DATABASE_URL < src/db/schema.sql
```

Or paste the contents of `src/db/schema.sql` into the Supabase SQL editor.

### 4. Seed vocabulary

This calls OpenAI to generate translations and example sentences — expect ~$2–5 in API costs for the full dataset.

```bash
npm run seed:vocab   # Spanish (5,000 words)
npm run seed:fr      # French (10,000 words)
```

### 5. Run locally

```bash
npm run dev
```

### 6. Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/)

1. Create a new Railway project and connect your GitHub repo
2. Add all environment variables from `.env` to the Railway service
3. Railway will auto-deploy on every push to `main`

---

## Project Structure

```
src/
├── bot/
│   └── handlers/        # Telegram command and callback handlers
├── db/
│   ├── schema.sql        # Database schema
│   └── seeds/            # Vocabulary seed scripts
│       └── data/         # Source word lists (OpenSubtitles CC BY 4.0)
├── jobs/                 # Cron jobs (word delivery, inactivity nudges)
├── services/             # Core business logic (vocabulary, quiz, sessions)
└── index.ts              # Entry point
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide (dev setup, PR process, code style, and adding new languages).

Contributions are welcome. Please follow this process:

1. **Open an issue first** — describe what you want to add or fix before writing code
2. Fork the repo and create a branch: `git checkout -b feature/your-feature`
3. Make your changes and ensure `npm run typecheck` passes
4. Open a pull request — describe what changed and why

### Adding a new language

1. Add word frequency data to `src/db/seeds/data/` (see existing `.txt` files for format)
2. Create a seed script following the pattern in `src/db/seeds/vocabulary-fr.ts`
3. Update the language selector in the onboarding handler
4. Open a PR

### Good first issues

- Improving quiz difficulty progression
- Adding new message templates
- Improving error messages and edge case handling
- Add Ollama support for local models
- Add Docker Compose for full local stack (bot + Postgres + Ollama)

---

## Vocabulary Data

Spanish and French word frequency lists are sourced from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

In plain terms: you can use, modify, and distribute this code, but if you run a modified version as a public service, you must also publish your modified source code under the same license.

For commercial licensing or white-label use, contact: support@langbistro.com
