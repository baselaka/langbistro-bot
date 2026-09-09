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
  winback_hook_sent_at TIMESTAMPTZ,
  winback_settings_sent_at TIMESTAMPTZ,
  winback_final_sent_at TIMESTAMPTZ,
  target_language TEXT NOT NULL DEFAULT 'es',
  interface_language TEXT NOT NULL DEFAULT 'en',
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  last_completed_date DATE,
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  last_freeze_week TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
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
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'paddle' CHECK (source IN ('paddle', 'comp', 'trial')),
  granted_by TEXT,
  note TEXT
);

-- At most one active entitlement per user (comps + paddle history may coexist).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_active_idx
  ON subscriptions(user_id) WHERE status = 'active';

-- Conversion / MRR: use this view (or filter source = 'paddle'), never raw is_subscribed alone.
-- security_invoker: callers use their own privileges (not the view owner's).
CREATE OR REPLACE VIEW paying_subscribers
WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.telegram_id,
  u.username,
  u.is_subscribed,
  s.id AS subscription_id,
  s.status,
  s.source,
  s.current_period_end,
  s.paddle_customer_id,
  s.paddle_subscription_id
FROM users u
JOIN subscriptions s ON s.user_id = u.id
WHERE u.is_subscribed = true
  AND s.source = 'paddle';

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
  is_active BOOLEAN NOT NULL DEFAULT true,
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
CREATE INDEX IF NOT EXISTS idx_vocabulary_language_tier_active
  ON vocabulary (language, tier)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_vocab_translations_vocab ON vocabulary_translations(vocabulary_id);
CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_id ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user_date ON daily_sessions(user_id, date);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_word_sets_user_id ON word_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_violations_user_id ON violations(user_id);

-- RLS enabled with no policies = deny-all for anon/authenticated.
-- The bot uses the service_role key, which bypasses RLS.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sessions ENABLE ROW LEVEL SECURITY;

-- =========================
-- DOWN
-- =========================

DROP POLICY IF EXISTS allow_all_daily_sessions ON daily_sessions;
DROP POLICY IF EXISTS allow_all_user_vocabulary ON user_vocabulary;
DROP POLICY IF EXISTS allow_all_vocabulary_translations ON vocabulary_translations;
DROP POLICY IF EXISTS allow_all_vocabulary ON vocabulary;

DROP INDEX IF EXISTS idx_daily_sessions_user_date;
DROP INDEX IF EXISTS idx_user_vocabulary_user_id_due_at;
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
DROP VIEW IF EXISTS paying_subscribers;
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

-- MIGRATION 010
/*
-- UP
-- PRS-93: subscription source (paddle/comp/trial), NULL period-end semantics,
-- and analytics that exclude comps. Conversion/MRR must use paying_subscribers
-- or filter source = 'paddle' — never count is_subscribed alone.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS granted_by text,
  ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_source_check'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_source_check
      CHECK (source IN ('paddle', 'comp', 'trial'));
  END IF;
END;
$$;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_active_idx
  ON public.subscriptions(user_id) WHERE status = 'active';

INSERT INTO public.subscriptions (user_id, status, source, note, current_period_end)
SELECT u.id, 'active', 'comp', 'backfill: pre-existing tester comp', NULL
FROM users u
WHERE u.is_subscribed = true
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
  );

-- Refund test account: was stuck on Pro with canceled + NULL period end.
UPDATE users SET is_subscribed = false WHERE id = 2;
UPDATE subscriptions
SET status = 'canceled', source = 'paddle'
WHERE user_id = 2;

CREATE OR REPLACE VIEW paying_subscribers
WITH (security_invoker = true) AS
SELECT
  u.id AS user_id,
  u.telegram_id,
  u.username,
  u.is_subscribed,
  s.id AS subscription_id,
  s.status,
  s.source,
  s.current_period_end,
  s.paddle_customer_id,
  s.paddle_subscription_id
FROM users u
JOIN subscriptions s ON s.user_id = u.id
WHERE u.is_subscribed = true
  AND s.source = 'paddle';

NOTIFY pgrst, 'reload schema';

-- DOWN
DROP VIEW IF EXISTS paying_subscribers;
DROP INDEX IF EXISTS subscriptions_user_active_idx;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS note,
  DROP COLUMN IF EXISTS granted_by,
  DROP COLUMN IF EXISTS source;
-- Re-adding UNIQUE(user_id) requires at most one row per user; clean duplicates first if rolling back.
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
*/

-- MIGRATION 011
/*
-- UP
-- PRS-91: exclude QA / internal accounts from retention & funnel analytics.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_internal = true WHERE id = 2;
NOTIFY pgrst, 'reload schema';

-- DOWN
ALTER TABLE users DROP COLUMN IF EXISTS is_internal;
*/

-- MIGRATION 012
/*
-- UP
-- PRS-89: production-graded spaced review on user_vocabulary.
ALTER TABLE user_vocabulary
  ADD COLUMN IF NOT EXISTS last_produced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_vocabulary_user_id_due_at
  ON user_vocabulary (user_id, due_at);

-- Existing learned rows enter the due pool immediately.
UPDATE user_vocabulary
SET interval_days = 1, due_at = NOW()
WHERE due_at IS NULL;

NOTIFY pgrst, 'reload schema';

-- Dashboard metrics (no bot UI):
-- Due hit rate: share of words_sent items with kind='due' that appear in words_used.
--   SELECT
--     COUNT(*) FILTER (WHERE w.elem->>'kind' = 'due') AS due_sent,
--     COUNT(*) FILTER (
--       WHERE w.elem->>'kind' = 'due'
--         AND EXISTS (
--           SELECT 1 FROM jsonb_array_elements(ds.words_used) u
--           WHERE (u->>'id') = (w.elem->>'id')
--         )
--     ) AS due_produced
--   FROM daily_sessions ds,
--        LATERAL jsonb_array_elements(ds.words_sent) AS w(elem)
--   WHERE ds.delivered_at IS NOT NULL;
-- Retention at ladder steps: rows at interval 7/14/30 still produced within window.
--   SELECT interval_days,
--          COUNT(*) AS n,
--          COUNT(*) FILTER (
--            WHERE last_produced_at IS NOT NULL
--              AND last_produced_at >= NOW() - (interval_days || ' days')::interval
--          ) AS produced_in_window
--   FROM user_vocabulary
--   WHERE interval_days IN (7, 14, 30)
--   GROUP BY interval_days;

-- DOWN
DROP INDEX IF EXISTS idx_user_vocabulary_user_id_due_at;
ALTER TABLE user_vocabulary
  DROP COLUMN IF EXISTS last_produced_at,
  DROP COLUMN IF EXISTS interval_days,
  DROP COLUMN IF EXISTS due_at;
*/

-- MIGRATION 013
/*
-- UP
-- PRS-87: win-back ladder timestamps for conversion measurement.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS winback_hook_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winback_settings_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winback_final_sent_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

-- DOWN
ALTER TABLE users
  DROP COLUMN IF EXISTS winback_hook_sent_at,
  DROP COLUMN IF EXISTS winback_settings_sent_at,
  DROP COLUMN IF EXISTS winback_final_sent_at;
*/

-- MIGRATION 014
/*
-- UP
-- PRS-99: soft-deactivate English tokenizer junk; replace contraction stems in place.
ALTER TABLE vocabulary
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_vocabulary_language_tier_active
  ON vocabulary (language, tier)
  WHERE is_active;

UPDATE vocabulary
SET word = 'wasn''t',
    translation = 'was not',
    example_sentence = 'He wasn''t ready for the test.',
    is_active = true
WHERE language = 'en'
  AND word = 'wasn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'wasn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'wasn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'wasn''t'
  );
UPDATE vocabulary
SET word = 'isn''t',
    translation = 'is not',
    example_sentence = 'This isn''t the right answer.',
    is_active = true
WHERE language = 'en'
  AND word = 'isn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'isn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'isn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'isn''t'
  );
UPDATE vocabulary
SET word = 'aren''t',
    translation = 'are not',
    example_sentence = 'They aren''t coming to dinner tonight.',
    is_active = true
WHERE language = 'en'
  AND word = 'aren'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'aren''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'aren'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'aren''t'
  );
UPDATE vocabulary
SET word = 'don''t',
    translation = 'do not',
    example_sentence = 'I don''t understand this word yet.',
    is_active = true
WHERE language = 'en'
  AND word = 'don'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'don''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'don'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'don''t'
  );
UPDATE vocabulary
SET word = 'doesn''t',
    translation = 'does not',
    example_sentence = 'She doesn''t like cold coffee.',
    is_active = true
WHERE language = 'en'
  AND word = 'doesn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'doesn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'doesn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'doesn''t'
  );
UPDATE vocabulary
SET word = 'didn''t',
    translation = 'did not',
    example_sentence = 'We didn''t finish the homework.',
    is_active = true
WHERE language = 'en'
  AND word = 'didn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'didn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'didn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'didn''t'
  );
UPDATE vocabulary
SET word = 'couldn''t',
    translation = 'could not',
    example_sentence = 'I couldn''t hear the speaker clearly.',
    is_active = true
WHERE language = 'en'
  AND word = 'couldn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'couldn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'couldn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'couldn''t'
  );
UPDATE vocabulary
SET word = 'shouldn''t',
    translation = 'should not',
    example_sentence = 'You shouldn''t skip breakfast every day.',
    is_active = true
WHERE language = 'en'
  AND word = 'shouldn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'shouldn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'shouldn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'shouldn''t'
  );
UPDATE vocabulary
SET word = 'wouldn''t',
    translation = 'would not',
    example_sentence = 'He wouldn''t share his notes with us.',
    is_active = true
WHERE language = 'en'
  AND word = 'wouldn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'wouldn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'wouldn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'wouldn''t'
  );
UPDATE vocabulary
SET word = 'hasn''t',
    translation = 'has not',
    example_sentence = 'She hasn''t called me back yet.',
    is_active = true
WHERE language = 'en'
  AND word = 'hasn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'hasn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'hasn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'hasn''t'
  );
UPDATE vocabulary
SET word = 'hadn''t',
    translation = 'had not',
    example_sentence = 'I hadn''t seen that movie before.',
    is_active = true
WHERE language = 'en'
  AND word = 'hadn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'hadn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'hadn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'hadn''t'
  );
UPDATE vocabulary
SET word = 'weren''t',
    translation = 'were not',
    example_sentence = 'They weren''t at the station on time.',
    is_active = true
WHERE language = 'en'
  AND word = 'weren'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'weren''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'weren'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'weren''t'
  );
UPDATE vocabulary
SET word = 'mustn''t',
    translation = 'must not',
    example_sentence = 'You mustn''t open the door yet.',
    is_active = true
WHERE language = 'en'
  AND word = 'mustn'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'mustn''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'mustn'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'mustn''t'
  );
UPDATE vocabulary
SET word = 'haven''t',
    translation = 'have not',
    example_sentence = 'I haven''t tried that restaurant.',
    is_active = true
WHERE language = 'en'
  AND word = 'haven'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'haven''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'haven'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'haven''t'
  );
UPDATE vocabulary
SET word = 'won''t',
    translation = 'will not',
    example_sentence = 'It won''t rain this afternoon.',
    is_active = true
WHERE language = 'en'
  AND word = 'won'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'won''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'won'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'won''t'
  );
UPDATE vocabulary
SET word = 'ain''t',
    translation = 'is/are/am not (informal)',
    example_sentence = 'That ain''t the way we say it here.',
    is_active = true
WHERE language = 'en'
  AND word = 'ain'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'ain''t' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = 'ain'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'ain''t'
  );
UPDATE vocabulary
SET word = 'i''m',
    translation = 'I am',
    example_sentence = 'I''m learning English every day.',
    is_active = true
WHERE language = 'en'
  AND word = '''m'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''m' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''m'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''m'
  );
UPDATE vocabulary
SET word = 'i''ll',
    translation = 'I will',
    example_sentence = 'I''ll call you after class.',
    is_active = true
WHERE language = 'en'
  AND word = '''ll'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''ll' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''ll'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''ll'
  );
UPDATE vocabulary
SET word = 'i''ve',
    translation = 'I have',
    example_sentence = 'I''ve finished the first lesson.',
    is_active = true
WHERE language = 'en'
  AND word = '''ve'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''ve' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''ve'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''ve'
  );
UPDATE vocabulary
SET word = 'i''d',
    translation = 'I would / I had',
    example_sentence = 'I''d like another example, please.',
    is_active = true
WHERE language = 'en'
  AND word = '''d'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''d' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''d'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'i''d'
  );
UPDATE vocabulary
SET word = 'you''re',
    translation = 'you are',
    example_sentence = 'You''re doing great with pronunciation.',
    is_active = true
WHERE language = 'en'
  AND word = '''re'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'you''re' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''re'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'you''re'
  );
UPDATE vocabulary
SET word = 'o''clock',
    translation = 'exactly on the hour',
    example_sentence = 'The meeting starts at three o''clock.',
    is_active = true
WHERE language = 'en'
  AND word = '''clock'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'o''clock' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''clock'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'o''clock'
  );
UPDATE vocabulary
SET word = 'c''mon',
    translation = 'come on (informal)',
    example_sentence = 'C''mon, let''s practice one more time.',
    is_active = true
WHERE language = 'en'
  AND word = '''mon'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'c''mon' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''mon'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'c''mon'
  );
UPDATE vocabulary
SET word = 'y''all',
    translation = 'you all (informal)',
    example_sentence = 'Y''all did well on today''s quiz.',
    is_active = true
WHERE language = 'en'
  AND word = '''all'
  AND NOT EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'y''all' AND v2.id <> vocabulary.id
  );
UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND word = '''all'
  AND EXISTS (
    SELECT 1 FROM vocabulary v2
    WHERE v2.language = 'en' AND v2.word = 'y''all'
  );

UPDATE vocabulary
SET is_active = false
WHERE language = 'en'
  AND is_active = true
  AND (
    word IN ('''am', '''and', '''cause', '''i', '''ii', '''s', '''s-', '''t', '''t-', '''the', '''you', 'a.', 'a.m.', 'ah', 'al', 'and-', 'aw', 'b', 'b.', 'bo', 'c', 'd', 'de', 'di', 'dr', 'dr.', 'e', 'ed', 'eh', 'el', 'er', 'f', 'g', 'h', 'hmm', 'huh', 'i-', 'i-i', 'i.', 'i.d.', 'j', 'jo', 'just-', 'k', 'l', 'l.a.', 'la', 'le', 'li', 'll', 'lt', 'm', 'mi', 'mm-hmm', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'n', 'no.', 'o', 'oi', 'ow', 'p', 'p.m.', 'pm', 'r', 's', 'si', 'st', 'st.', 't', 'tv', 'u', 'u.s.', 'uh', 'uh-', 'uh-huh', 'um', 'w', 'x', 'y', 'you-')
    OR (char_length(word) = 1 AND lower(word) NOT IN ('a', 'i'))
    OR word ~ '^''|''$|-$|^-'
    OR word ~ '[^[:alpha:]''\-]'
    OR (word LIKE '%''%' AND word !~ '^[[:alpha:]]+''[[:alpha:]]+$')
  );


INSERT INTO vocabulary (word, translation, example_sentence, tier, frequency_rank, language, is_active)
SELECT v.word, v.translation, v.example_sentence, v.tier, v.frequency_rank, v.language, v.is_active
FROM (VALUES
('genuine', 'English word: genuine', 'Please practice using the word genuine today.', 5, 4921, 'en', true),
('judging', 'English word: judging', 'Please practice using the word judging today.', 5, 4922, 'en', true),
('doubts', 'English word: doubts', 'Please practice using the word doubts today.', 5, 4923, 'en', true),
('ceiling', 'English word: ceiling', 'Please practice using the word ceiling today.', 5, 4924, 'en', true),
('practicing', 'English word: practicing', 'Please practice using the word practicing today.', 5, 4925, 'en', true),
('somewhat', 'English word: somewhat', 'Please practice using the word somewhat today.', 5, 4926, 'en', true),
('established', 'English word: established', 'Please practice using the word established today.', 5, 4927, 'en', true),
('attempted', 'English word: attempted', 'Please practice using the word attempted today.', 5, 4928, 'en', true),
('generations', 'English word: generations', 'Please practice using the word generations today.', 5, 4929, 'en', true),
('gathering', 'English word: gathering', 'Please practice using the word gathering today.', 5, 4930, 'en', true),
('electrical', 'English word: electrical', 'Please practice using the word electrical today.', 5, 4931, 'en', true),
('couples', 'English word: couples', 'Please practice using the word couples today.', 5, 4932, 'en', true),
('depend', 'English word: depend', 'Please practice using the word depend today.', 5, 4933, 'en', true),
('institute', 'English word: institute', 'Please practice using the word institute today.', 5, 4934, 'en', true),
('principle', 'English word: principle', 'Please practice using the word principle today.', 5, 4935, 'en', true),
('fixing', 'English word: fixing', 'Please practice using the word fixing today.', 5, 4936, 'en', true),
('therapist', 'English word: therapist', 'Please practice using the word therapist today.', 5, 4937, 'en', true),
('compete', 'English word: compete', 'Please practice using the word compete today.', 5, 4938, 'en', true),
('compliment', 'English word: compliment', 'Please practice using the word compliment today.', 5, 4939, 'en', true),
('worship', 'English word: worship', 'Please practice using the word worship today.', 5, 4940, 'en', true),
('residence', 'English word: residence', 'Please practice using the word residence today.', 5, 4941, 'en', true),
('democracy', 'English word: democracy', 'Please practice using the word democracy today.', 5, 4942, 'en', true),
('published', 'English word: published', 'Please practice using the word published today.', 5, 4943, 'en', true),
('myth', 'English word: myth', 'Please practice using the word myth today.', 5, 4944, 'en', true),
('helpless', 'English word: helpless', 'Please practice using the word helpless today.', 5, 4945, 'en', true),
('execution', 'English word: execution', 'Please practice using the word execution today.', 5, 4946, 'en', true),
('appetite', 'English word: appetite', 'Please practice using the word appetite today.', 5, 4947, 'en', true),
('formal', 'English word: formal', 'Please practice using the word formal today.', 5, 4948, 'en', true),
('strictly', 'English word: strictly', 'Please practice using the word strictly today.', 5, 4949, 'en', true),
('chickens', 'English word: chickens', 'Please practice using the word chickens today.', 5, 4950, 'en', true),
('technical', 'English word: technical', 'Please practice using the word technical today.', 5, 4951, 'en', true),
('meets', 'English word: meets', 'Please practice using the word meets today.', 5, 4952, 'en', true),
('brutal', 'English word: brutal', 'Please practice using the word brutal today.', 5, 4953, 'en', true),
('vain', 'English word: vain', 'Please practice using the word vain today.', 5, 4954, 'en', true),
('switched', 'English word: switched', 'Please practice using the word switched today.', 5, 4955, 'en', true),
('deer', 'English word: deer', 'Please practice using the word deer today.', 5, 4956, 'en', true),
('dresses', 'English word: dresses', 'Please practice using the word dresses today.', 5, 4957, 'en', true),
('retire', 'English word: retire', 'Please practice using the word retire today.', 5, 4958, 'en', true),
('overcome', 'English word: overcome', 'Please practice using the word overcome today.', 5, 4959, 'en', true),
('inspiration', 'English word: inspiration', 'Please practice using the word inspiration today.', 5, 4960, 'en', true),
('thrilled', 'English word: thrilled', 'Please practice using the word thrilled today.', 5, 4961, 'en', true),
('suggestion', 'English word: suggestion', 'Please practice using the word suggestion today.', 5, 4962, 'en', true),
('sailor', 'English word: sailor', 'Please practice using the word sailor today.', 5, 4963, 'en', true),
('destination', 'English word: destination', 'Please practice using the word destination today.', 5, 4964, 'en', true),
('picnic', 'English word: picnic', 'Please practice using the word picnic today.', 5, 4965, 'en', true),
('trucks', 'English word: trucks', 'Please practice using the word trucks today.', 5, 4966, 'en', true),
('rank', 'English word: rank', 'Please practice using the word rank today.', 5, 4967, 'en', true),
('blocked', 'English word: blocked', 'Please practice using the word blocked today.', 5, 4968, 'en', true),
('strict', 'English word: strict', 'Please practice using the word strict today.', 5, 4969, 'en', true),
('formula', 'English word: formula', 'Please practice using the word formula today.', 5, 4970, 'en', true),
('clerk', 'English word: clerk', 'Please practice using the word clerk today.', 5, 4971, 'en', true),
('disturbed', 'English word: disturbed', 'Please practice using the word disturbed today.', 5, 4972, 'en', true),
('cafe', 'English word: cafe', 'Please practice using the word cafe today.', 5, 4973, 'en', true),
('wandering', 'English word: wandering', 'Please practice using the word wandering today.', 5, 4974, 'en', true),
('consciousness', 'English word: consciousness', 'Please practice using the word consciousness today.', 5, 4975, 'en', true),
('bare', 'English word: bare', 'Please practice using the word bare today.', 5, 4976, 'en', true),
('butcher', 'English word: butcher', 'Please practice using the word butcher today.', 5, 4977, 'en', true),
('arrangement', 'English word: arrangement', 'Please practice using the word arrangement today.', 5, 4978, 'en', true),
('chased', 'English word: chased', 'Please practice using the word chased today.', 5, 4979, 'en', true),
('ministry', 'English word: ministry', 'Please practice using the word ministry today.', 5, 4980, 'en', true),
('sweater', 'English word: sweater', 'Please practice using the word sweater today.', 5, 4981, 'en', true),
('locate', 'English word: locate', 'Please practice using the word locate today.', 5, 4982, 'en', true),
('apologise', 'English word: apologise', 'Please practice using the word apologise today.', 5, 4983, 'en', true),
('examine', 'English word: examine', 'Please practice using the word examine today.', 5, 4984, 'en', true),
('trains', 'English word: trains', 'Please practice using the word trains today.', 5, 4985, 'en', true),
('candle', 'English word: candle', 'Please practice using the word candle today.', 5, 4986, 'en', true),
('prior', 'English word: prior', 'Please practice using the word prior today.', 5, 4987, 'en', true),
('stream', 'English word: stream', 'Please practice using the word stream today.', 5, 4988, 'en', true),
('passage', 'English word: passage', 'Please practice using the word passage today.', 5, 4989, 'en', true),
('reaching', 'English word: reaching', 'Please practice using the word reaching today.', 5, 4990, 'en', true),
('organ', 'English word: organ', 'Please practice using the word organ today.', 5, 4991, 'en', true),
('directions', 'English word: directions', 'Please practice using the word directions today.', 5, 4992, 'en', true),
('outer', 'English word: outer', 'Please practice using the word outer today.', 5, 4993, 'en', true),
('proves', 'English word: proves', 'Please practice using the word proves today.', 5, 4994, 'en', true),
('luxury', 'English word: luxury', 'Please practice using the word luxury today.', 5, 4995, 'en', true),
('funds', 'English word: funds', 'Please practice using the word funds today.', 5, 4996, 'en', true),
('sunset', 'English word: sunset', 'Please practice using the word sunset today.', 5, 4997, 'en', true),
('strings', 'English word: strings', 'Please practice using the word strings today.', 5, 4998, 'en', true),
('fortunately', 'English word: fortunately', 'Please practice using the word fortunately today.', 5, 4999, 'en', true),
('gotcha', 'English word: gotcha', 'Please practice using the word gotcha today.', 5, 5000, 'en', true),
('tomb', 'English word: tomb', 'Please practice using the word tomb today.', 5, 5001, 'en', true),
('horizon', 'English word: horizon', 'Please practice using the word horizon today.', 5, 5002, 'en', true),
('engineering', 'English word: engineering', 'Please practice using the word engineering today.', 5, 5003, 'en', true),
('element', 'English word: element', 'Please practice using the word element today.', 5, 5004, 'en', true),
('balloon', 'English word: balloon', 'Please practice using the word balloon today.', 5, 5005, 'en', true)
) AS v(word, translation, example_sentence, tier, frequency_rank, language, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM vocabulary existing
  WHERE existing.language = 'en' AND existing.word = v.word
);


NOTIFY pgrst, 'reload schema';

-- DOWN
DROP INDEX IF EXISTS idx_vocabulary_language_tier_active;
-- Note: word renames / gloss updates are not reversed.
ALTER TABLE vocabulary DROP COLUMN IF EXISTS is_active;
*/
