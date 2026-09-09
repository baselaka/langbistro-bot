-- PRS-102: Moderation evidence columns, atomic strike RPC, 90-day content purge.
--
-- Deploy order:
--   1. Merge + deploy the bot build that writes the new columns
--   2. Apply this migration (or apply migration first if the new columns are required at boot —
--      prefer applying before or with the deploy that inserts into the new columns)
--   3. Leave MODERATION_ENFORCE unset/false for ~1 day (shadow-only)
--   4. Review enforced=false rows, then set MODERATION_ENFORCE=true on Railway
--
-- Manual content purge if pg_cron is unavailable:
--   UPDATE violations
--   SET content = NULL, content_purged_at = NOW()
--   WHERE content IS NOT NULL
--     AND created_at < NOW() - INTERVAL '90 days';

-- =========================
-- UP
-- =========================

ALTER TABLE violations
  ALTER COLUMN violation_type DROP NOT NULL;

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS categories JSONB,
  ADD COLUMN IF NOT EXISTS category_scores JSONB,
  ADD COLUMN IF NOT EXISTS category_applied_input_types JSONB,
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'omni-moderation-latest',
  ADD COLUMN IF NOT EXISTS enforced BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS content_purged_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION increment_violation_count(p_user_id BIGINT)
RETURNS TABLE(violation_count INTEGER, is_banned BOOLEAN)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE users u
  SET
    violation_count = u.violation_count + 1,
    is_banned = CASE WHEN u.violation_count + 1 >= 5 THEN TRUE ELSE u.is_banned END
  WHERE u.id = p_user_id
  RETURNING u.violation_count, u.is_banned;
END;
$$;

-- Optional: daily purge of transcript text after 90 days (scores/rows kept).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'purge-violation-content';

    PERFORM cron.schedule(
      'purge-violation-content',
      '0 4 * * *',
      $cron$
        UPDATE violations
        SET content = NULL, content_purged_at = NOW()
        WHERE content IS NOT NULL
          AND created_at < NOW() - INTERVAL '90 days'
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — schedule purge-violation-content manually or run the UPDATE in the header';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job unavailable — skip scheduling purge-violation-content';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule purge-violation-content: %', SQLERRM;
END;
$$;

-- =========================
-- DOWN
-- =========================
/*
DROP FUNCTION IF EXISTS increment_violation_count(BIGINT);

ALTER TABLE violations
  DROP COLUMN IF EXISTS content_purged_at,
  DROP COLUMN IF EXISTS enforced,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS category_applied_input_types,
  DROP COLUMN IF EXISTS category_scores,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS content;

-- Restore NOT NULL only after clearing nulls:
-- UPDATE violations SET violation_type = 'restricted_content' WHERE violation_type IS NULL;
-- ALTER TABLE violations ALTER COLUMN violation_type SET NOT NULL;

-- Optional: SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-violation-content';
*/
