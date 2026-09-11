-- PRS-103: Scope conversation history by target language.
--
-- Deploy order:
--   1. Apply this migration in Supabase
--   2. Deploy the bot build that writes/filters messages.target_language
--
-- If the bot deploys first, every messages insert fails on an unknown column.

-- =========================
-- UP
-- =========================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS target_language TEXT;

-- Backfill so existing users do not lose their current thread on deploy.
UPDATE messages m
SET target_language = u.target_language
FROM users u
WHERE m.user_id = u.id
  AND m.target_language IS NULL;

CREATE INDEX IF NOT EXISTS messages_user_target_created_idx
  ON messages (user_id, target_language, created_at DESC);

-- =========================
-- DOWN
-- =========================
/*
DROP INDEX IF EXISTS messages_user_target_created_idx;
ALTER TABLE messages DROP COLUMN IF EXISTS target_language;
*/
