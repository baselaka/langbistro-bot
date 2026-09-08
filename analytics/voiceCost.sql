-- Voice cost monitor (PRS-84).
-- Budget: ~$0.003 per voice turn. Alert when the monthly projection exceeds $75.
-- Requires `learners` view (analytics/learners.sql) so QA/internal accounts are excluded.

WITH daily AS (
  SELECT
    u.date,
    SUM(u.voice_count)::bigint AS voice_turns,
    ROUND(SUM(u.voice_count) * 0.003, 4) AS estimated_cost_usd
  FROM usage_daily u
  INNER JOIN learners l ON l.id = u.user_id
  WHERE u.date >= (CURRENT_DATE - INTERVAL '30 days')
  GROUP BY u.date
),
rollup AS (
  SELECT
    COALESCE(SUM(voice_turns), 0) AS voice_turns_30d,
    COALESCE(SUM(estimated_cost_usd), 0) AS cost_30d_usd,
    COUNT(*)::numeric AS days_with_usage
  FROM daily
)
SELECT
  d.date,
  d.voice_turns,
  d.estimated_cost_usd AS cost_that_day_usd,
  r.voice_turns_30d,
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
