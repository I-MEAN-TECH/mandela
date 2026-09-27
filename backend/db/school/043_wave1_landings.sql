-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 043: TODAY LANDINGS, WAVE 1 (Phase 5)
--   §6: every wave-1 role's home is their Today. The 022 seeds predate the
--   role dashboards: bursar landed on 'money' and teacher had no landing at
--   all. Flip both to 'today' (their pulse views); Money stays one tab away
--   via the bursar nav (Collect/Reconcile/Levies/Reports).
-- ============================================================================

UPDATE perm_matrix SET landing = false
WHERE module_key = 'money' AND role = 'bursar' AND landing = true;

INSERT INTO perm_matrix (module_key, role, owns, sees, landing) VALUES
  ('today', 'bursar', false, true, true)
ON CONFLICT (module_key, role) DO UPDATE SET landing = true;
