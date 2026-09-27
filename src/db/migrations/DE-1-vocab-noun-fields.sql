-- DE-1: German noun fields on vocabulary.

-- =========================
-- UP
-- =========================

ALTER TABLE vocabulary
  ADD COLUMN IF NOT EXISTS article TEXT CHECK (article IN ('der','die','das')),
  ADD COLUMN IF NOT EXISTS plural  TEXT,
  ADD COLUMN IF NOT EXISTS forms   TEXT[];

-- =========================
-- DOWN
-- =========================

ALTER TABLE vocabulary
  DROP COLUMN IF EXISTS forms,
  DROP COLUMN IF EXISTS plural,
  DROP COLUMN IF EXISTS article;
