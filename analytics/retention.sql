-- Retention & funnel metrics (PRS-92).
-- Run section-by-section in the Supabase SQL editor (or the whole file).
-- Requires: migrations 008/009/011 + learners view (analytics/learners.sql).
-- All sections exclude is_internal accounts via learners.
--
-- 2026-09-06 baseline in the ticket INCLUDED the internal QA account;
-- learner-filtered numbers will be slightly lower.

-- =============================================================================
-- 0. Baseline snapshot (reproducibility)
-- =============================================================================
WITH learner_msgs AS (
  SELECT
    m.user_id,
    (m.created_at AT TIME ZONE 'UTC')::date AS msg_day,
    COUNT(*)::bigint AS n
  FROM messages m
  INNER JOIN learners l ON l.id = m.user_id
  WHERE m.role = 'user'
  GROUP BY m.user_id, (m.created_at AT TIME ZONE 'UTC')::date
),
per_user AS (
  SELECT
    user_id,
    COUNT(*)::bigint AS active_days,
    SUM(n)::bigint AS total_user_msgs
  FROM learner_msgs
  GROUP BY user_id
),
engaged_days AS (
  SELECT
    ds.user_id,
    ds.date AS day,
    ds.user_turns
  FROM daily_sessions ds
  INNER JOIN learners l ON l.id = ds.user_id
  WHERE ds.engaged_at IS NOT NULL
),
active_30d AS (
  SELECT DISTINCT user_id
  FROM engaged_days
  WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
)
SELECT
  (SELECT COUNT(*) FROM learners) AS total_learners,
  (SELECT COUNT(*) FROM learners WHERE onboarding_complete) AS onboarded,
  (SELECT COUNT(*) FROM per_user) AS ever_sent_a_message,
  (SELECT COUNT(*) FROM per_user WHERE active_days >= 2) AS messaged_on_2plus_days,
  (SELECT COUNT(*) FROM per_user WHERE active_days >= 7) AS messaged_on_7plus_days,
  (SELECT COUNT(*) FROM active_30d) AS active_last_30_days,
  (
    SELECT ROUND(AVG(user_turns)::numeric, 2)
    FROM engaged_days
    WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
  ) AS avg_user_turns_per_engaged_day_30d,
  (
    SELECT ROUND(
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY user_turns))::numeric,
      2
    )
    FROM engaged_days
    WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
  ) AS median_user_turns_per_engaged_day_30d,
  (
    SELECT COUNT(DISTINCT ps.user_id)
    FROM paying_subscribers ps
    INNER JOIN learners l ON l.id = ps.user_id
  ) AS paying_subscribers,
  (
    SELECT COUNT(*)
    FROM daily_sessions ds
    INNER JOIN learners l ON l.id = ds.user_id
    WHERE ds.delivered_at IS NOT NULL
      AND ds.engaged_at IS NULL
  ) AS daily_pushes_to_never_engaged_sessions;

-- =============================================================================
-- 1. Cohort retention — D1 / D7 / D30 by signup week (on engaged_at)
-- =============================================================================
-- D1  = engaged on calendar day after signup date (day offset = 1)
-- D7  = engaged on any day with offset 1..7
-- D30 = engaged on any day with offset 1..30
WITH cohorts AS (
  SELECT
    id AS user_id,
    date_trunc('week', created_at)::date AS cohort_week,
    (created_at AT TIME ZONE 'UTC')::date AS signup_date
  FROM learners
),
engagement_days AS (
  SELECT
    ds.user_id,
    (ds.engaged_at AT TIME ZONE 'UTC')::date AS engage_date
  FROM daily_sessions ds
  INNER JOIN learners l ON l.id = ds.user_id
  WHERE ds.engaged_at IS NOT NULL
),
retained AS (
  SELECT
    c.cohort_week,
    c.user_id,
    BOOL_OR(ed.engage_date = c.signup_date + 1) AS retained_d1,
    BOOL_OR(
      ed.engage_date > c.signup_date
      AND ed.engage_date <= c.signup_date + 7
    ) AS retained_d7,
    BOOL_OR(
      ed.engage_date > c.signup_date
      AND ed.engage_date <= c.signup_date + 30
    ) AS retained_d30
  FROM cohorts c
  LEFT JOIN engagement_days ed ON ed.user_id = c.user_id
  GROUP BY c.cohort_week, c.user_id
)
SELECT
  cohort_week,
  COUNT(*)::bigint AS cohort_size,
  COUNT(*) FILTER (WHERE retained_d1)::bigint AS retained_d1,
  COUNT(*) FILTER (WHERE retained_d7)::bigint AS retained_d7,
  COUNT(*) FILTER (WHERE retained_d30)::bigint AS retained_d30,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE retained_d1) / NULLIF(COUNT(*), 0),
    1
  ) AS d1_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE retained_d7) / NULLIF(COUNT(*), 0),
    1
  ) AS d7_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE retained_d30) / NULLIF(COUNT(*), 0),
    1
  ) AS d30_pct
FROM retained
GROUP BY cohort_week
ORDER BY cohort_week DESC;

-- =============================================================================
-- 2. Session completion rate
-- =============================================================================
-- completed_at IS NOT NULL ÷ delivered_at IS NOT NULL
SELECT
  'all_time' AS window,
  COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::bigint AS delivered_sessions,
  COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed_sessions,
  ROUND(
    100.0
      * COUNT(*) FILTER (WHERE completed_at IS NOT NULL)
      / NULLIF(COUNT(*) FILTER (WHERE delivered_at IS NOT NULL), 0),
    1
  ) AS completion_pct
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id

UNION ALL

SELECT
  'last_30d' AS window,
  COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::bigint,
  COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint,
  ROUND(
    100.0
      * COUNT(*) FILTER (WHERE completed_at IS NOT NULL)
      / NULLIF(COUNT(*) FILTER (WHERE delivered_at IS NOT NULL), 0),
    1
  )
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id
WHERE ds.date >= (CURRENT_DATE - INTERVAL '30 days');

-- =============================================================================
-- 3. Words produced per session (median jsonb_array_length(words_used))
-- =============================================================================
SELECT
  'all_time' AS window,
  COUNT(*)::bigint AS delivered_sessions,
  ROUND(
    (percentile_cont(0.5) WITHIN GROUP (
      ORDER BY jsonb_array_length(ds.words_used)
    ))::numeric,
    2
  ) AS median_words_used,
  ROUND(AVG(jsonb_array_length(ds.words_used))::numeric, 2) AS avg_words_used
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id
WHERE ds.delivered_at IS NOT NULL

UNION ALL

SELECT
  'last_30d' AS window,
  COUNT(*)::bigint,
  ROUND(
    (percentile_cont(0.5) WITHIN GROUP (
      ORDER BY jsonb_array_length(ds.words_used)
    ))::numeric,
    2
  ),
  ROUND(AVG(jsonb_array_length(ds.words_used))::numeric, 2)
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id
WHERE ds.delivered_at IS NOT NULL
  AND ds.date >= (CURRENT_DATE - INTERVAL '30 days');

-- =============================================================================
-- 4. Turns per engaged session (median user_turns)
-- =============================================================================
-- North-star vs ~2.39 user messages per active day (2026-09-06 baseline).
SELECT
  'all_time' AS window,
  COUNT(*)::bigint AS engaged_sessions,
  ROUND(
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY ds.user_turns))::numeric,
    2
  ) AS median_user_turns,
  ROUND(AVG(ds.user_turns)::numeric, 2) AS avg_user_turns
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id
WHERE ds.engaged_at IS NOT NULL

UNION ALL

SELECT
  'last_30d' AS window,
  COUNT(*)::bigint,
  ROUND(
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY ds.user_turns))::numeric,
    2
  ),
  ROUND(AVG(ds.user_turns)::numeric, 2)
FROM daily_sessions ds
INNER JOIN learners l ON l.id = ds.user_id
WHERE ds.engaged_at IS NOT NULL
  AND ds.date >= (CURRENT_DATE - INTERVAL '30 days');

-- =============================================================================
-- 5. Voice share (user messages only; prefer messages over usage_daily)
-- =============================================================================
-- usage_daily undercounts Pro (subscribed users skip increment).
SELECT
  COUNT(*) FILTER (WHERE m.message_type = 'voice')::bigint AS voice_msgs,
  COUNT(*) FILTER (WHERE m.message_type = 'text')::bigint AS text_msgs,
  COUNT(*)::bigint AS total_user_msgs,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE m.message_type = 'voice') / NULLIF(COUNT(*), 0),
    1
  ) AS voice_share_pct
FROM messages m
INNER JOIN learners l ON l.id = m.user_id
WHERE m.role = 'user';

-- =============================================================================
-- 6. Free → paid conversion (+ signup tenure; true TTC needs subscriptions.created_at)
-- =============================================================================
-- Denominator: learners who ever engaged (real reply), not all signups.
-- Time-to-conversion: subscriptions has no created_at — report days_since_signup
-- for current payers as tenure, not true conversion latency.
WITH ever_engaged AS (
  SELECT DISTINCT ds.user_id
  FROM daily_sessions ds
  INNER JOIN learners l ON l.id = ds.user_id
  WHERE ds.engaged_at IS NOT NULL
),
payers AS (
  SELECT ps.user_id, l.created_at AS signed_up_at, l.username
  FROM paying_subscribers ps
  INNER JOIN learners l ON l.id = ps.user_id
)
SELECT
  (SELECT COUNT(*) FROM ever_engaged) AS ever_engaged_learners,
  (SELECT COUNT(*) FROM payers) AS paying_learners,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM payers)
      / NULLIF((SELECT COUNT(*) FROM ever_engaged), 0),
    2
  ) AS conversion_pct_of_engaged;

-- Payer tenure (proxy until subscriptions.created_at exists)
SELECT
  p.user_id,
  p.username,
  p.signed_up_at,
  ROUND(
    EXTRACT(EPOCH FROM (NOW() - p.signed_up_at)) / 86400.0,
    1
  ) AS days_since_signup
FROM (
  SELECT ps.user_id, l.created_at AS signed_up_at, l.username
  FROM paying_subscribers ps
  INNER JOIN learners l ON l.id = ps.user_id
) p
ORDER BY p.signed_up_at;

-- =============================================================================
-- 7. Cost per active user (voice × $0.003 + TTS chars)
-- =============================================================================
-- Voice STT budget: learner user voice messages in last 30d × $0.003 (PRS-84).
-- TTS: SUM(char_length) of assistant content × $0.0000181 (PRS-90 empiric;
-- same rate as analytics/voiceCost.sql). Assistant text is post-truncation.
WITH mau AS (
  SELECT COUNT(DISTINCT ds.user_id)::numeric AS n
  FROM daily_sessions ds
  INNER JOIN learners l ON l.id = ds.user_id
  WHERE ds.engaged_at IS NOT NULL
    AND ds.date >= (CURRENT_DATE - INTERVAL '30 days')
),
voice AS (
  SELECT COUNT(*)::bigint AS voice_turns_30d
  FROM messages m
  INNER JOIN learners l ON l.id = m.user_id
  WHERE m.role = 'user'
    AND m.message_type = 'voice'
    AND m.created_at >= (NOW() - INTERVAL '30 days')
),
tts AS (
  SELECT COALESCE(SUM(char_length(m.content)), 0)::bigint AS tts_chars_30d
  FROM messages m
  INNER JOIN learners l ON l.id = m.user_id
  WHERE m.role = 'assistant'
    AND m.created_at >= (NOW() - INTERVAL '30 days')
),
costs AS (
  SELECT
    v.voice_turns_30d,
    t.tts_chars_30d,
    ROUND(v.voice_turns_30d * 0.003, 4) AS voice_cost_30d_usd,
    ROUND(t.tts_chars_30d * 0.0000181, 4) AS tts_cost_30d_usd,
    ROUND(v.voice_turns_30d * 0.003 + t.tts_chars_30d * 0.0000181, 4) AS total_cost_30d_usd,
    m.n AS mau
  FROM voice v
  CROSS JOIN tts t
  CROSS JOIN mau m
)
SELECT
  voice_turns_30d,
  tts_chars_30d,
  voice_cost_30d_usd,
  tts_cost_30d_usd,
  total_cost_30d_usd,
  mau,
  CASE
    WHEN mau > 0 THEN ROUND(total_cost_30d_usd / mau, 4)
    ELSE NULL
  END AS cost_per_mau_usd,
  -- 30d window already ≈ one month; treat total_cost_30d as monthly projection
  total_cost_30d_usd AS monthly_projection_usd,
  (total_cost_30d_usd > 75) AS alert_over_75_usd
FROM costs;
