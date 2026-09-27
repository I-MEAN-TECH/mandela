-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 046: PERF INDEXES (System completion D5, §9)
--   The four hot paths the platform plan names, now backed by btree:
--     · attendance lookups by (day, learner)   — marks, heatmaps, % rolls
--     · payments by (state, paid_at)           — collections, term sums
--     · audit_log newest-first                 — trails, health page
--     · message queue (state, created_at DESC) — talk worker pick-up
--   CONCURRENTLY is not available inside the migrator's transaction; these
--   tables are small per school at current fleet size, plain CREATE INDEX is
--   correct here and stays re-runnable via IF NOT EXISTS.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_attendance_day_learner ON attendance(day, learner_id);
CREATE INDEX IF NOT EXISTS idx_payments_state_paid ON payments(state, paid_at);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_message_state_created ON message(state, created_at DESC);
