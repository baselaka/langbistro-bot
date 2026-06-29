# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

---

## [1.0.0] - 2026-06-28

First public release. LangBistro is a voice-first Telegram bot for learning Spanish and French through daily vocabulary, AI conversation, and fill-in-the-blank quizzes.

### Added

- Public README with self-hosting instructions and feature overview
- AGPL-3.0 license
- `CONTRIBUTING.md` and `CHANGELOG.md`
- OpenSubtitles frequency word lists for Spanish (5,000 words) and French (10,000 words), with CC BY 4.0 attribution in `ATTRIBUTIONS.md`
- Vocabulary seed scripts reading from `src/db/seeds/data/*.txt`
- Spanish and French language support with `/language` command and language-aware onboarding
- Daily delivery of 10 frequency-ranked vocabulary words per user tier
- Fill-in-the-blank quizzes with GPT-generated sentences
- Text-to-speech pronunciation for vocabulary words (OpenAI TTS)
- Voice message support via Whisper transcription
- Progress tracking across 5 vocabulary tiers and milestone messages (50–4,000 words)
- Freemium model with Paddle subscription checkout and customer portal
- Inactivity re-engagement cron job for users who stop practicing
- Health check HTTP endpoint for deployment monitoring

### Changed

- Vocabulary sources switched from hardcoded/Excel lists to OpenSubtitles FrequencyWords data
- Supabase vocabulary upserts now use `onConflict: "word, language"` for multi-language support
- Quiz flow simplified: fill-blank only (review quiz removed from daily delivery)
- Fill-blank sentences generated at runtime via GPT instead of stored example sentences

### Fixed

- Duplicate daily word delivery when users had not yet engaged
- Vocabulary seed batch resilience and word sanitization for GPT prompts
- Language validation and encouragement message variety in quiz responses
- Settings screen message order for level and time buttons
- Level-aware TTS playback speed (beginner at 0.85×)
- Timezone handling for preferred word delivery time

### Removed

- `xlsx` dependency (vocabulary seeds now read plain-text word lists)

---

## Pre-1.0 development

These changes were part of building LangBistro before the first tagged public release. They are summarized here for self-hosters upgrading from early private builds.

### Added

- Initial GrammY bot scaffold with Supabase persistence
- AI conversation engine with structured JSON replies, grammar corrections, and UX flow
- Onboarding flow: language, level, and preferred daily word time
- Vocabulary system with tiered word delivery and user progress tracking
- Paddle subscription integration and `/subscribe` command
- Node.js 20+ engine requirement

### Changed

- Subscribe flow simplified to direct Paddle checkout links
- Settings limited to level and time; subscription management via Paddle portal

### Fixed

- Whisper transcription hints for Spanish learners
- Paddle portal session API usage
- Onboarding timezone and level prompt constraints
