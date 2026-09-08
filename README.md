# LangBistro

LangBistro is the open-source codebase behind [@LangBistroBot](https://t.me/LangBistroBot), a voice-first Telegram language tutor. You can self-host it; this repo is a reference implementation of that product — not a generic language-learning framework.

It delivers daily vocabulary, fill-in-the-blank quizzes, and spoken pronunciation inside Telegram. No separate app is required.

**Supported languages:** Spanish 🇪🇸 · French 🇫🇷 · English 🇬🇧

**Try it:** [@LangBistroBot](https://t.me/LangBistroBot)

---

## Features

- 📚 10 new words delivered daily, ranked by real-world frequency
- 🎧 Text-to-speech pronunciation for every word
- ✏️ AI-generated fill-in-the-blank quizzes
- 🎤 Voice message support (speech-to-text)
- 📈 Progress tracking across 5 vocabulary tiers
- 💳 Freemium model with a subscription paywall

## Infrastructure & Dependencies

This is not a batteries-included framework. To run your own instance you need **your own** accounts and keys for the services the code talks to (or you replace those integrations). See `src/config/env.ts` for required environment variables and `src/db/schema.sql` for the database schema. Do not copy production secrets, tokens, or checkout/price identifiers from anyone else's deployment.

| Need | What you provide | Notes |
|------|------------------|--------|
| Runtime | Node.js 20+ | Required. See `engines` in `package.json`. |
| Messaging | A Telegram bot token | Create one with [@BotFather](https://t.me/botfather). |
| Database | Postgres (row-level security) | Schema lives in `src/db/schema.sql`. The default client is a hosted Postgres HTTP API; point env vars at your own project, or swap the client in `src/db/client.ts`. |
| AI | Chat, speech-to-text, and TTS | Conversation, transcription, and pronunciation go through `src/ai/openai.ts`. Use your own API key; swapping providers means changing that module. |
| Payments | A checkout / Merchant of Record provider | Optional if you remove the paywall. The current wiring lives in `src/services/subscription.ts` and is validated at boot in `src/config/env.ts`. |
| Hosting | A long-lived Node.js 20 process | Railway, Vercel, a VPS, Docker, or any similar host. The bot long-polls Telegram, serves HTTP for health checks and payment webhooks, and runs cron jobs. Short-lived request-only platforms need extra work to match that process model. |

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- A Telegram bot token ([create one via @BotFather](https://t.me/botfather))
- A Postgres database (see Infrastructure & Dependencies)
- An API key for chat, transcription, and TTS
- A payment-provider account if you keep the paywall (required at boot today; skip by changing `src/config/env.ts` and removing the paywall)

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

Open `.env` and fill in your values. The full set required to boot is validated in `src/config/env.ts` — do not commit `.env` or production secrets.

### 3. Set up the database

Apply the schema to your Postgres project:

```bash
# Apply schema
psql $DATABASE_URL < src/db/schema.sql
```

Or paste the contents of `src/db/schema.sql` into your database SQL editor.

### 4. Seed vocabulary

This calls the configured AI API to generate translations and example sentences — expect a few dollars of API cost for the full dataset.

```bash
npm run seed:vocab   # Spanish (5,000 words)
npm run seed:fr      # French (10,000 words)
npm run seed:en      # English (5,000 words)
```

### 5. Run locally

```bash
npm run dev
```

Do not run a local `npm run dev` against the same bot token as a live instance — two pollers will conflict and messages get lost.

### 6. Deploy

Build, then start a long-lived process:

```bash
npm run build
npm run start
```

That works on Railway, Vercel, a VPS, Docker, or any other host that can run Node.js 20 continuously. Copy the same environment variables you use locally into the platform's secret store. Give the process an HTTP port for `/health` and payment webhooks.

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

1. Add an entry to `src/config/languages.ts` (`SUPPORTED_LANGUAGES` + `LANGUAGES` config)
2. Add word frequency data to `src/db/seeds/data/` (see existing `.txt` files for format)
3. Create a seed script following the pattern in `src/db/seeds/vocabulary-en.ts`
4. Add system prompts in `src/ai/openai.ts`
5. Open a PR with seed instructions and estimated AI seeding cost

### Good first issues

- Improving quiz difficulty progression
- Adding new message templates
- Improving error messages and edge case handling
- Add local-model support for chat, transcription, and TTS
- Add Docker Compose for a full local stack (bot + Postgres + local models)

---

## Vocabulary Data

Spanish, French, and English word frequency lists are sourced from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) by Hermit Dave, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

In plain terms: you can use, modify, and distribute this code, but if you run a modified version as a public service, you must also publish your modified source code under the same license.

For commercial licensing or white-label use, contact: support@langbistro.com
