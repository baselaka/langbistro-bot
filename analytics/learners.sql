-- Learners only (exclude QA / comps / founder admin).
-- Requires migration 011 (`users.is_internal`). Apply in Supabase SQL editor.
-- PRS-92 retention queries should join this view or filter `u.is_internal = false`.

CREATE OR REPLACE VIEW learners AS
SELECT *
FROM users
WHERE is_internal = false;
