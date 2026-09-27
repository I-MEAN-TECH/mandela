-- ============================================================================
-- MANDELA — 015 ADMIN WRITE POLICIES (Terms & Calendar · Guardians & Parents)
-- The two remaining Admin modules write to tables that existed from 001 but
-- only ever had read policies. Without these, RLS (default deny) blocks every
-- INSERT/UPDATE from the app role. Write rights = admin/principal only.
-- ============================================================================

-- 1) TERM — the school's clock (007 gave everyone SELECT; nobody could write).
CREATE POLICY term_admin_ins ON term FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY term_admin_upd ON term FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY term_admin_del ON term FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal'));

-- 2) GUARDIAN — 002 gave staff SELECT and guardians self-SELECT; the register
--    finally needs its write path.
CREATE POLICY guardian_admin_ins ON guardian FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY guardian_admin_upd ON guardian FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- 3) LEARNER_GUARDIAN — linking parents to children (and unlinking).
CREATE POLICY lg_admin_ins ON learner_guardian FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY lg_admin_del ON learner_guardian FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal'));
