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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  fill_blank_word_id BIGINT REFERENCES vocabulary(id),
  review_word_id BIGINT REFERENCES vocabulary(id),
  engaged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_tier ON vocabulary(tier);
CREATE INDEX IF NOT EXISTS idx_vocabulary_rank ON vocabulary(frequency_rank);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_id ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user_date ON daily_sessions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_word_sets_user_id ON word_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_violations_user_id ON violations(user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
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
DROP POLICY IF EXISTS allow_all_vocabulary ON vocabulary;

DROP INDEX IF EXISTS idx_daily_sessions_user_date;
DROP INDEX IF EXISTS idx_user_vocabulary_user_id;
DROP INDEX IF EXISTS idx_vocabulary_rank;
DROP INDEX IF EXISTS idx_vocabulary_tier;

DROP TABLE IF EXISTS daily_sessions;
DROP TABLE IF EXISTS user_vocabulary;
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
