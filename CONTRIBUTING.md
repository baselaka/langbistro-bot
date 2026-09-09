# Contributing to LangBistro

Thank you for your interest in contributing. LangBistro is a voice-first Telegram language learning bot built with TypeScript, GrammY, Supabase, and OpenAI.

This guide covers how to set up a local environment, what we accept, and how to submit changes.

## Before you start

1. **Open an issue first** for anything non-trivial (new features, refactors, behavior changes). Describe the problem, your proposed approach, and whether you plan to work on it. This avoids duplicate work and lets us align on scope early.
2. **Read the license.** This project is [AGPL-3.0](LICENSE). If you run a modified version as a public service, you must publish your modified source under the same license.
3. **Do not commit secrets.** Never commit `.env` files, API keys, tokens, or credentials. See `.gitignore` and `audit-before-public.sh`.

## What we welcome

- Bug fixes with a clear reproduction path
- Improvements to quiz flow, onboarding, error handling, and edge cases
- New message templates and UX copy (Spanish and French)
- Documentation improvements
- New language support (see below)
- Performance and reliability improvements to cron jobs and database queries

## What we are less likely to accept

- Large rewrites without prior discussion
- Changes that require new paid services without a fallback
- Features that bypass usage limits or subscription checks
- Style-only churn across unrelated files
- Commits that include generated secrets, personal data, or vendored vocabulary with unclear licensing

## Development setup

### Prerequisites

- **Node.js 20+** (see `engines` in `package.json`)
- **npm**
- A [Telegram bot token](https://t.me/botfather)
- A [Supabase](https://supabase.com/) project
- An [OpenAI API key](https://platform.openai.com/)
- A [Paddle](https://paddle.com/) account (required by `src/config/env.ts` for the app to start)

### 1. Clone and install

```bash
git clone https://github.com/baselaka/langbistro-bot.git
cd langbistro-bot
npm install
git config core.hooksPath .githooks
```

The git hook blocks direct commits to `main`. Use a feature branch and open a PR instead.

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in all values required by `src/config/env.ts`:

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `OPENAI_API_KEY` | GPT, Whisper, and TTS |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key (bypasses RLS; never use in browsers) |
| `SUPABASE_ANON_KEY` | Deprecated / optional — kept for Railway rollback only |
| `PADDLE_API_KEY` | Paddle API access |
| `PADDLE_WEBHOOK_SECRET` | Paddle webhook verification |
| `PADDLE_MONTHLY_PRICE_ID` | Monthly subscription price ID |
| `PADDLE_YEARLY_PRICE_ID` | Yearly subscription price ID |

### 3. Database

Apply the schema to your Supabase project:

```bash
# Option A: psql
psql $DATABASE_URL < src/db/schema.sql

# Option B: paste src/db/schema.sql into the Supabase SQL editor
```

Existing projects that still have permissive `allow_all` RLS policies must apply
[`src/db/migrations/PRS-101-drop-allow-all.sql`](src/db/migrations/PRS-101-drop-allow-all.sql)
**after** the bot is running with `SUPABASE_SERVICE_ROLE_KEY` (see that file's deploy order).

### 4. Seed vocabulary (optional for local dev)

Seeding calls OpenAI to generate translations and example sentences. Expect API cost if you seed the full dataset.

```bash
npm run seed        # Spanish starter set (500 words)
npm run seed:vocab  # Spanish full set (5,000 words)
npm run seed:fr     # French (10,000 words)
npm run seed:en     # English (5,000 words)
```

Word lists live in `src/db/seeds/data/` and are sourced from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY 4.0). See [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

### 5. Run locally

```bash
npm run dev
```

Other useful scripts:

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | ESLint on `src/` |
| `npm run test` | Vitest (unit tests in `src/**/__tests__/`) |
| `npm run test:watch` | Vitest in watch mode |

Before you open a PR, confirm CI will pass locally:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Any new or modified business logic should include a Vitest test in the same PR. See `CLAUDE.md` for agent workflow rules (branch naming, testing expectations, CI policy).

## Project layout

```
src/
├── bot/handlers/     # Telegram commands, callbacks, voice, settings
├── db/
│   ├── schema.sql    # Postgres schema
│   └── seeds/        # Vocabulary seed scripts and data/
├── jobs/             # Cron: daily word delivery, inactivity nudges
├── services/         # Vocabulary, quizzes, sessions, onboarding
├── ai/               # OpenAI client and prompts
└── index.ts          # Entry point
```

When adding behavior, prefer extending existing services and handlers rather than introducing parallel patterns.

## Code guidelines

- **TypeScript, strict mode.** Match existing types and avoid `any` unless unavoidable.
- **Minimal diffs.** Fix the problem at hand; avoid unrelated refactors in the same PR.
- **Follow existing conventions.** Naming, imports (`node:fs`, `node:path`), Zod validation, and Supabase access patterns should match surrounding code.
- **Environment config** goes through `src/config/env.ts` — do not read `process.env` ad hoc in new code.
- **User-facing UI copy** goes through `src/i18n` (`en`, `es`, `pt`, `ru`). Target-language tutor replies (Spanish, French, or English) live in prompts/config. Meta-explanations follow `interface_language`; for ESL with English UI, `replyExplanation` is a simpler English paraphrase.
- **Vocabulary data** must include proper attribution if you add or replace word lists (CC BY 4.0 or compatible).

## Adding a new language

1. Add the language to `src/config/languages.ts` (`SUPPORTED_LANGUAGES` + full `LanguageConfig` entry).
2. Add a frequency word list to `src/db/seeds/data/` (one word per line, `#` comment header for attribution).
3. Create a seed script following `src/db/seeds/vocabulary-en.ts` (GPT enrichment + Supabase upsert with `language` set).
4. Add GPT system prompts for the new language in `src/ai/openai.ts`.
5. Document the vocabulary source in `ATTRIBUTIONS.md`.
6. Open a PR with seed instructions and estimated OpenAI seeding cost.

## Submitting a pull request

1. Fork the repository and create a branch from `main` (use the Linear ticket prefix when applicable):

   ```bash
   git checkout -b fix/PRS-123-quiz-answer-matching
   ```

2. Make your changes and confirm:

   ```bash
   npm run typecheck && npm run lint && npm run test && npm run build
   ```

3. Commit with a clear message. We use conventional prefixes where practical:
   - `feat:` new feature
   - `fix:` bug fix
   - `chore:` tooling, deps, config
   - `docs:` documentation only
   - `refactor:` code change without behavior change

4. Open a pull request against `main` with:
   - **What** changed
   - **Why** it was needed
   - **How to test** (steps, env vars, expected behavior)
   - Screenshots or bot message examples for UX changes

5. Link the related issue if one exists.

We review PRs as time allows. Smaller, focused PRs are merged faster than large ones.

## Security

If you discover a security vulnerability, **do not open a public issue**. Email support@langbistro.com with details and steps to reproduce.

## Questions

- **Bugs and features:** [GitHub Issues](https://github.com/baselaka/langbistro-bot/issues)
- **Commercial licensing:** support@langbistro.com
