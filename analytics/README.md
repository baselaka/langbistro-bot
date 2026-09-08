# Analytics

On-demand SQL for retention and funnel metrics. No dashboard app — run these in the Supabase SQL editor.

## Prerequisites

1. Apply **migrations 008, 009, 011, 012, and 013** from [`src/db/schema.sql`](../src/db/schema.sql):
   - 008 — `daily_sessions.delivered_at` / `engaged_at` / `user_turns`
   - 009 — `daily_sessions.words_used` / `completed_at`
   - 011 — `users.is_internal` (flag user id 2)
   - 012 — `user_vocabulary` SRS fields (`due_at` / `interval_days` / `last_produced_at`)
   - 013 — `users.winback_hook_sent_at` / `winback_settings_sent_at` / `winback_final_sent_at`
2. Apply [`learners.sql`](./learners.sql) so queries can use the `learners` view.

Always filter with `is_internal = false` (or join `learners`). Never include QA/admin accounts in retention numbers.

## French learner dogfooding (PRS-91)

Create a real free-tier French account separate from QA user id 2:

1. Create a second Telegram account (separate phone or dual account).
2. `/start` LangBistro and complete onboarding as **French** (`target_language = 'fr'`).
3. Set a real `preferred_word_time` / timezone you will actually reply to.
4. Stay on free tier: `is_subscribed = false`, `is_internal = false`.
5. Confirm the daily push arrives; reply within the day.
6. After the first message, verify in Supabase:

```sql
SELECT id, telegram_id, target_language, is_subscribed, is_internal, preferred_word_time
FROM users
WHERE telegram_id = <new_id>;
-- expect: fr, false, false, non-null time
```

Do not insert a fake user row without a real `telegram_id` — Telegram delivery requires a real chat.

## Retention metrics (PRS-92)

Run [`retention.sql`](./retention.sql) in the Supabase SQL editor (whole file or section-by-section).

| Section | Metric |
| -- | -- |
| 0 | Baseline funnel snapshot (comparable to the 2026-09-06 ticket baseline; that run included the internal account) |
| 1 | Cohort D1 / D7 / D30 by signup week, on `engaged_at` |
| 2 | Session completion rate (`completed_at` ÷ `delivered_at`) |
| 3 | Median words produced per delivered session |
| 4 | Median `user_turns` per engaged session |
| 5 | Voice share of user messages (from `messages`, not `usage_daily`) |
| 6 | Free→paid conversion among ever-engaged learners; payer `days_since_signup` (true time-to-conversion needs `subscriptions.created_at`) |
| 7 | Cost per MAU: voice × $0.003 + TTS chars at the PRS-90 empiric rate. `alert_over_75_usd` is the budget tripwire |

## Voice / TTS cost (PRS-90)

Run [`voiceCost.sql`](./voiceCost.sql) in the Supabase SQL editor for a day-by-day TTS rollup.

- Estimates TTS spend from learner **assistant** message lengths (`char_length(content)`), matching post-truncation text spoken by TTS.
- Rate: ~`$0.0015 / 83 chars` ≈ `$0.0000181` per character (PRS-90 empiric).
- `monthly_projection_usd` extrapolates from the last 30 days of usage.
- Treat `alert_over_75_usd = true` as the budget tripwire.
- Per-turn Railway logs: `[TTS] chars=N` (all `generateVoice` calls) and conversation-path logs with `max` / `truncated` / `level`.
- For cost **per active user** (voice STT budget + TTS), prefer section 7 of [`retention.sql`](./retention.sql).

## Win-back conversion (PRS-87)

Run [`winbackConversion.sql`](./winbackConversion.sql) after migration 013.

| Step | Meaning |
| -- | -- |
| hook | Day-3 single-word nudge (`winback_hook_sent_at`) |
| settings | Day-10 `/settings` offer (`winback_settings_sent_at`) |
| final | Day-21 goodbye (`winback_final_sent_at`) |

Conversion = learners who sent a **user** message after that step’s timestamp ÷ learners who received the step. Permanent suppress and Telegram 403 both land at `inactivity_stage = 4`; only users with the matching `winback_*_sent_at` count toward that step’s denominator.

