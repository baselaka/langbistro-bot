-- Learners only (exclude QA / comps / founder admin).
-- Requires migration 011 (`users.is_internal`). Apply in Supabase SQL editor.
-- PRS-92 retention queries should join this view or filter `u.is_internal = false`.
-- security_invoker: callers use their own privileges (not the view owner's).

CREATE OR REPLACE VIEW learners
WITH (security_invoker = true) AS
SELECT *
FROM users
WHERE is_internal = false;
