-- ============================================================================
-- MANDELA — CONTROL DB MIGRATION 002: JOIN CODE (Phase 1, DEV-PHASES.md)
-- The school invite code lives on the control row so the public API can
-- validate a code before touching any school database: one lookup says
-- which tenant the request is for. Secrets (passwords) never come here.
-- ============================================================================
ALTER TABLE school
  ADD COLUMN IF NOT EXISTS join_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS join_code_updated_at timestamptz;
