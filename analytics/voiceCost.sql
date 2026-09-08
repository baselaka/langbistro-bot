-- Voice / TTS cost monitor (PRS-90).
-- Estimates spend from assistant reply length (what TTS speaks), not turn counts.
-- Empiric rate from PRS-90: ~$0.0015 per 83 chars ≈ $0.0000181 / char.
-- Alert when the monthly projection exceeds $75.
-- Requires `learners` view (analytics/learners.sql) so QA/internal accounts are excluded.

WITH daily AS (
  SELECT
    (m.created_at AT TIME ZONE 'UTC')::date AS date,
    SUM(char_length(m.content))::bigint AS tts_chars,
    ROUND(SUM(char_length(m.content)) * 0.0000181, 4) AS estimated_cost_usd
  FROM messages m
  INNER JOIN learners l ON l.id = m.user_id
  WHERE m.role = 'assistant'
    AND m.created_at >= ((CURRENT_DATE - INTERVAL '30 days') AT TIME ZONE 'UTC')
  GROUP BY 1
),
rollup AS (
  SELECT
    COALESCE(SUM(tts_chars), 0) AS tts_chars_30d,
    COALESCE(SUM(estimated_cost_usd), 0) AS cost_30d_usd,
    COUNT(*)::numeric AS days_with_usage
  FROM daily
)
SELECT
  d.date,
  d.tts_chars,
  d.estimated_cost_usd AS cost_that_day_usd,
  r.tts_chars_30d,
  r.cost_30d_usd,
  ROUND(
    CASE
      WHEN r.days_with_usage > 0
        THEN (r.cost_30d_usd / r.days_with_usage) * 30
      ELSE 0
    END,
    2
  ) AS monthly_projection_usd,
  CASE
    WHEN r.days_with_usage > 0
      AND (r.cost_30d_usd / r.days_with_usage) * 30 > 75
      THEN true
    ELSE false
  END AS alert_over_75_usd
FROM daily d
CROSS JOIN rollup r
ORDER BY d.date DESC;
