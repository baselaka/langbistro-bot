-- LangBistro schema
-- =========================
-- UP
-- =========================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  language_code TEXT,
  preferred_word_time TIME,
  is_subscribed BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  violation_count INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'beginner',
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  words_learned_count INTEGER NOT NULL DEFAULT 0,
  current_tier INTEGER NOT NULL DEFAULT 1,
  preferred_word_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  last_active_at TIMESTAMPTZ,
  inactivity_stage INTEGER NOT NULL DEFAULT 0,
  target_language TEXT NOT NULL DEFAULT 'es',
  interface_language TEXT NOT NULL DEFAULT 'en',
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  last_completed_date DATE,
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  last_freeze_week TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
    CREATE TYPE message_role AS ENUM ('user', 'assistant');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('text', 'voice');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  message_type message_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_daily (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  text_count INTEGER NOT NULL DEFAULT 0,
  voice_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS word_sets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  words JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS violations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id BIGSERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  translation TEXT,
  example_sentence TEXT,
  tier INTEGER NOT NULL DEFAULT 1,
  frequency_rank INTEGER NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocabulary_translations (
  id BIGSERIAL PRIMARY KEY,
  vocabulary_id BIGINT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  gloss TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vocabulary_id, locale)
);

CREATE TABLE IF NOT EXISTS user_vocabulary (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id BIGINT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, vocabulary_id)
);

CREATE TABLE IF NOT EXISTS daily_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  words_sent JSONB NOT NULL DEFAULT '[]',
  words_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  fill_blank_word_id BIGINT REFERENCES vocabulary(id),
  review_word_id BIGINT REFERENCES vocabulary(id),
  engaged BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  engaged_at TIMESTAMPTZ,
  user_turns INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  checklist_message_id BIGINT,
  session_win TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_tier ON vocabulary(tier);
CREATE INDEX IF NOT EXISTS idx_vocabulary_rank ON vocabulary(frequency_rank);
CREATE INDEX IF NOT EXISTS idx_vocabulary_language_tier ON vocabulary(language, tier);
CREATE INDEX IF NOT EXISTS idx_vocab_translations_vocab ON vocabulary_translations(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_id ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user_date ON daily_sessions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_word_sets_user_id ON word_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_violations_user_id ON violations(user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'allow_all_users'
  ) THEN
    CREATE POLICY allow_all_users ON users
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'violations'
      AND policyname = 'allow_all_violations'
  ) THEN
    CREATE POLICY allow_all_violations ON violations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vocabulary'
      AND policyname = 'allow_all_vocabulary'
  ) THEN
    CREATE POLICY allow_all_vocabulary ON vocabulary
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vocabulary_translations'
      AND policyname = 'allow_all_vocabulary_translations'
  ) THEN
    CREATE POLICY allow_all_vocabulary_translations ON vocabulary_translations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_vocabulary'
      AND policyname = 'allow_all_user_vocabulary'
  ) THEN
    CREATE POLICY allow_all_user_vocabulary ON user_vocabulary
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'daily_sessions'
      AND policyname = 'allow_all_daily_sessions'
  ) THEN
    CREATE POLICY allow_all_daily_sessions ON daily_sessions
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- =========================
-- DOWN
-- =========================

DROP POLICY IF EXISTS allow_all_daily_sessions ON daily_sessions;
DROP POLICY IF EXISTS allow_all_user_vocabulary ON user_vocabulary;
DROP POLICY IF EXISTS allow_all_vocabulary_translations ON vocabulary_translations;
DROP POLICY IF EXISTS allow_all_vocabulary ON vocabulary;

DROP INDEX IF EXISTS idx_daily_sessions_user_date;
DROP INDEX IF EXISTS idx_user_vocabulary_user_id;
DROP INDEX IF EXISTS idx_vocab_translations_vocab;
DROP INDEX IF EXISTS idx_vocabulary_rank;
DROP INDEX IF EXISTS idx_vocabulary_tier;
DROP INDEX IF EXISTS idx_vocabulary_language_tier;

DROP TABLE IF EXISTS daily_sessions;
DROP TABLE IF EXISTS user_vocabulary;
DROP TABLE IF EXISTS vocabulary_translations;
DROP TABLE IF EXISTS vocabulary;

DROP INDEX IF EXISTS idx_word_sets_user_id;
DROP INDEX IF EXISTS idx_usage_daily_user_date;
DROP INDEX IF EXISTS idx_messages_user_id;
DROP INDEX IF EXISTS idx_violations_user_id;

DROP POLICY IF EXISTS allow_all_violations ON violations;
DROP POLICY IF EXISTS allow_all_users ON users;
DROP TABLE IF EXISTS violations;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS word_sets;
DROP TABLE IF EXISTS usage_daily;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS message_type;
DROP TYPE IF EXISTS message_role;

-- MIGRATION 002
/*
-- UP
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_stage INTEGER NOT NULL DEFAULT 0;

-- DOWN
ALTER TABLE users DROP COLUMN IF EXISTS last_active_at;
ALTER TABLE users DROP COLUMN IF EXISTS inactivity_stage;
*/

-- MIGRATION 003
/*
-- UP
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'es';
ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';
CREATE INDEX IF NOT EXISTS idx_vocabulary_language_tier ON vocabulary(language, tier);
-- DOWN
DROP INDEX IF EXISTS idx_vocabulary_language_tier;
ALTER TABLE vocabulary DROP COLUMN IF EXISTS language;
ALTER TABLE users DROP COLUMN IF EXISTS target_language;
*/

-- MIGRATION 004

-- MIGRATION 005
/*
-- UP
UPDATE users
SET preferred_word_time = (
  (
    (CURRENT_DATE::text || ' ' || preferred_word_time::text)::timestamp
    AT TIME ZONE 'America/New_York'
  )
  AT TIME ZONE 'UTC'
)::time
WHERE preferred_word_time IS NOT NULL
  AND onboarding_complete = true;

-- DOWN
UPDATE users
SET preferred_word_time = (
  (
    (CURRENT_DATE::text || ' ' || preferred_word_time::text)::timestamp
    AT TIME ZONE 'UTC'
  )
  AT TIME ZONE 'America/New_York'
)::time
WHERE preferred_word_time IS NOT NULL
  AND onboarding_complete = true;
*/

-- MIGRATION 006
/*
-- UP
ALTER TABLE users ADD COLUMN IF NOT EXISTS interface_language TEXT NOT NULL DEFAULT 'en';

UPDATE users
SET interface_language = CASE
  WHEN lower(split_part(replace(coalesce(language_code, ''), '_', '-'), '-', 1)) = 'es' THEN 'es'
  WHEN lower(split_part(replace(coalesce(language_code, ''), '_', '-'), '-', 1)) = 'pt' THEN 'pt'
  WHEN lower(split_part(replace(coalesce(language_code, ''), '_', '-'), '-', 1)) = 'ru' THEN 'ru'
  ELSE 'en'
END;

-- DOWN
ALTER TABLE users DROP COLUMN IF EXISTS interface_language;
*/

-- MIGRATION 007
/*
-- UP
CREATE TABLE IF NOT EXISTS vocabulary_translations (
  id BIGSERIAL PRIMARY KEY,
  vocabulary_id BIGINT NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  gloss TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vocabulary_id, locale)
);
CREATE INDEX IF NOT EXISTS idx_vocab_translations_vocab ON vocabulary_translations(vocabulary_id);
ALTER TABLE vocabulary_translations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vocabulary_translations'
      AND policyname = 'allow_all_vocabulary_translations'
  ) THEN
    CREATE POLICY allow_all_vocabulary_translations ON vocabulary_translations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- DOWN
DROP POLICY IF EXISTS allow_all_vocabulary_translations ON vocabulary_translations;
DROP INDEX IF EXISTS idx_vocab_translations_vocab;
DROP TABLE IF EXISTS vocabulary_translations;
*/

-- MIGRATION 008
/*
-- UP
-- delivered_at is the same-day word-send guard. engaged_at / user_turns are
-- real reply metrics. Keep legacy `engaged` for one deploy (still written by
-- word delivery) so a code rollback keeps dedup working.
ALTER TABLE daily_sessions
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_turns INTEGER NOT NULL DEFAULT 0;

UPDATE daily_sessions SET delivered_at = created_at WHERE engaged = true AND delivered_at IS NULL;

UPDATE daily_sessions d
SET engaged_at = s.first_msg, user_turns = s.n
FROM (
  SELECT ds.id, MIN(m.created_at) AS first_msg, COUNT(*) AS n
  FROM daily_sessions ds
  JOIN messages m ON m.user_id = ds.user_id AND m.role = 'user'
   AND m.created_at >= ds.created_at
   AND m.created_at <  ds.created_at + interval '24 hours'
  GROUP BY ds.id
) s WHERE d.id = s.id;

NOTIFY pgrst, 'reload schema';

-- DOWN
ALTER TABLE daily_sessions
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS engaged_at,
  DROP COLUMN IF EXISTS user_turns;
*/

-- MIGRATION 009
/*
-- UP
-- PRS-86 checklist + PRS-88 session wrap-up / streak.
ALTER TABLE daily_sessions
  ADD COLUMN IF NOT EXISTS words_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checklist_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS session_win TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS streak_current INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_best INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_completed_date DATE,
  ADD COLUMN IF NOT EXISTS sessions_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_freeze_week TEXT;

NOTIFY pgrst, 'reload schema';

-- DOWN
ALTER TABLE daily_sessions
  DROP COLUMN IF EXISTS words_used,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS checklist_message_id,
  DROP COLUMN IF EXISTS session_win;

ALTER TABLE users
  DROP COLUMN IF EXISTS streak_current,
  DROP COLUMN IF EXISTS streak_best,
  DROP COLUMN IF EXISTS last_completed_date,
  DROP COLUMN IF EXISTS sessions_completed,
  DROP COLUMN IF EXISTS last_freeze_week;
*/