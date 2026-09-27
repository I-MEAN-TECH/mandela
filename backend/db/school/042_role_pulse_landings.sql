-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 042: ROLE PULSE LANDINGS (Phase 5)
--   Role dashboards wave 1 (teacher, bursar, principal, counter, driver).
--   'today' is every wave-1 role's home (spec §6: the home screen answers the
--   role's #1 question). The 022 seeds left counter/driver without one —
--   resolveLanding would have fallen back to /app (the admin Pulse).
--   Safe to re-run: ON CONFLICT DO NOTHING.
-- ============================================================================

INSERT INTO perm_matrix (module_key, role, owns, sees, landing) VALUES
  ('today', 'counter', false, true, true),
  ('today', 'driver',  false, true, true)
ON CONFLICT (module_key, role) DO NOTHING;
