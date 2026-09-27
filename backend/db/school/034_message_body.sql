-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 034: MESSAGE BODY
-- The daily loop (033) queues digest/receipt messages that carry their own
-- text; announcement rows get theirs via the announcement join. A nullable
-- body column covers both: COALESCE(m.body, a.body) at send time.
-- ============================================================================

ALTER TABLE message ADD COLUMN IF NOT EXISTS body text;
