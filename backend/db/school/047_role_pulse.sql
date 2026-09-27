-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 047: ROLE PULSE ROLLUPS (System completion D4, §9)
--   Dashboards read ONE small row instead of re-running the pulse queries on
--   every load. The worker (same loop as talk) refreshes each school-wide
--   role's payload every 60s; the API serves it while fresh (<90s) and falls
--   back to computing live when stale/absent — so rollup breakage can never
--   show an empty screen, and every existing gate stays meaningful.
--   Teacher/HOD stay live: their reads are class-scoped through session GUCs
--   (RLS semantics that a shared rollup row cannot carry).
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_pulse (
  role         text PRIMARY KEY,               -- bursar|principal|counter|driver|dorm_parent|janitor|librarian|patron
  payload      jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE role_pulse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_pulse_read ON role_pulse;
CREATE POLICY role_pulse_read ON role_pulse FOR SELECT USING (
  current_setting('app.role', true) IS NOT NULL);
-- Writes come from the worker (owner connection, like the talk fanout).
DROP POLICY IF EXISTS role_pulse_write ON role_pulse;
CREATE POLICY role_pulse_write ON role_pulse FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
