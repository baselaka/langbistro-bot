# Analytics

On-demand SQL for retention and funnel metrics. No dashboard app — run these in the Supabase SQL editor.

## Prerequisites

1. Apply **migration 011** from [`src/db/schema.sql`](../src/db/schema.sql) (`users.is_internal`, flag user id 2).
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

## Voice cost (PRS-84)

Run [`voiceCost.sql`](./voiceCost.sql) in the Supabase SQL editor.

- Estimates spend as `voice_turns × $0.003` for learner accounts only.
- `monthly_projection_usd` extrapolates from the last 30 days of usage.
- Treat `alert_over_75_usd = true` as the budget tripwire.

## Next

[PRS-92](https://linear.app/kp-knowledge/issue/PRS-92) ships `analytics/retention.sql` (D1/D7/D30 and related metrics) filtered on learners.
