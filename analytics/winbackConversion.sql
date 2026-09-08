-- Win-back ladder conversion (PRS-87).
-- Run in the Supabase SQL editor after migration 013.
-- Learners only (is_internal = false via learners view).
--
-- Conversion = users who sent a user message after a ladder timestamp
--              ÷ users who received that ladder step.

WITH hook AS (
  SELECT
    u.id AS user_id,
    u.winback_hook_sent_at AS sent_at
  FROM users u
  INNER JOIN learners l ON l.id = u.id
  WHERE u.winback_hook_sent_at IS NOT NULL
),
settings AS (
  SELECT
    u.id AS user_id,
    u.winback_settings_sent_at AS sent_at
  FROM users u
  INNER JOIN learners l ON l.id = u.id
  WHERE u.winback_settings_sent_at IS NOT NULL
),
final AS (
  SELECT
    u.id AS user_id,
    u.winback_final_sent_at AS sent_at
  FROM users u
  INNER JOIN learners l ON l.id = u.id
  WHERE u.winback_final_sent_at IS NOT NULL
),
hook_converted AS (
  SELECT DISTINCT h.user_id
  FROM hook h
  INNER JOIN messages m ON m.user_id = h.user_id AND m.role = 'user' AND m.created_at > h.sent_at
),
settings_converted AS (
  SELECT DISTINCT s.user_id
  FROM settings s
  INNER JOIN messages m ON m.user_id = s.user_id AND m.role = 'user' AND m.created_at > s.sent_at
),
final_converted AS (
  SELECT DISTINCT f.user_id
  FROM final f
  INNER JOIN messages m ON m.user_id = f.user_id AND m.role = 'user' AND m.created_at > f.sent_at
)
SELECT
  'hook'::text AS ladder_step,
  (SELECT COUNT(*) FROM hook)::bigint AS sent,
  (SELECT COUNT(*) FROM hook_converted)::bigint AS converted,
  CASE
    WHEN (SELECT COUNT(*) FROM hook) = 0 THEN NULL
    ELSE ROUND(
      (SELECT COUNT(*) FROM hook_converted)::numeric
      / (SELECT COUNT(*) FROM hook)::numeric,
      4
    )
  END AS conversion_rate
UNION ALL
SELECT
  'settings',
  (SELECT COUNT(*) FROM settings),
  (SELECT COUNT(*) FROM settings_converted),
  CASE
    WHEN (SELECT COUNT(*) FROM settings) = 0 THEN NULL
    ELSE ROUND(
      (SELECT COUNT(*) FROM settings_converted)::numeric
      / (SELECT COUNT(*) FROM settings)::numeric,
      4
    )
  END
UNION ALL
SELECT
  'final',
  (SELECT COUNT(*) FROM final),
  (SELECT COUNT(*) FROM final_converted),
  CASE
    WHEN (SELECT COUNT(*) FROM final) = 0 THEN NULL
    ELSE ROUND(
      (SELECT COUNT(*) FROM final_converted)::numeric
      / (SELECT COUNT(*) FROM final)::numeric,
      4
    )
  END
ORDER BY ladder_step;
