-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 044: PHASE 6 ROLE OPENING (DEV-PHASES Phase 6)
--   Dorm parent, janitor, librarian, patron, HOD go live (§6.7–6.11).
--   1) Landings: every new role's home is their Today — the §5-era
--      operations/academics landings flip off (same pattern as 042/043).
--   2) RLS: the 022/023/024 role-list policies predate these roles; without
--      grants their pulses and screens read zero rows. Idempotent: every
--      policy is dropped + recreated with the full role list.
--   DPA unchanged: clinic_visit/health_record stay principal+infirmary-hat.
--   HOD reads attendance/assessments through the existing per-teacher policy
--   (007 att_staff / 002 asmt_staff) — its per-class GUC scope is how a HOD
--   sees their department's classes; the API sets app_teacher_class_ids.
-- ============================================================================

-- 1) Landings ----------------------------------------------------------------
UPDATE perm_matrix SET landing = false
WHERE role IN ('dorm_parent','janitor','librarian','patron','hod')
  AND landing = true;

INSERT INTO perm_matrix (module_key, role, owns, sees, landing) VALUES
  ('today', 'dorm_parent', false, true, true),
  ('today', 'janitor',     false, true, true),
  ('today', 'librarian',   false, true, true),
  ('today', 'patron',      false, true, true),
  ('today', 'hod',         false, true, true)
ON CONFLICT (module_key, role) DO UPDATE SET landing = true;

-- 2) RLS grants for the new roles --------------------------------------------
-- Learner + guardian links: everyone reads the roster (dorm rollcall, HOD
-- dept, patron sections, librarian issue). Writes stay admin/principal.
DROP POLICY IF EXISTS learner_staff ON learner;
CREATE POLICY learner_staff ON learner USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter',
     'dorm_parent','janitor','librarian','patron','hod'));
DROP POLICY IF EXISTS lg_staff ON learner_guardian;
CREATE POLICY lg_staff ON learner_guardian USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','dorm_parent','hod'));

-- Attendance (read via the 007 att_staff teacher-scope policy; grant hod the
-- same scope-shape). 007's att_staff stays as-is — hod inherits through it
-- only if listed. Recreate with hod + dorm_parent included.
DROP POLICY IF EXISTS att_staff ON attendance;
CREATE POLICY att_staff ON attendance USING (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter','dorm_parent','hod')
  OR (current_setting('app.role', true) IN ('teacher','hod')
      AND learner_id IN (SELECT id FROM learner WHERE class_id IN (SELECT app_teacher_class_ids()))));

-- Assessments (same shape as attendance; 002 asmt_staff).
DROP POLICY IF EXISTS asmt_staff ON assessment;
CREATE POLICY asmt_staff ON assessment USING (
  current_setting('app.role', true) IN ('admin','principal','hod')
  OR (current_setting('app.role', true) = 'teacher'
      AND learner_id IN (SELECT id FROM learner WHERE class_id IN (SELECT app_teacher_class_ids()))));

-- Homework + timetable slots (read: staff-wide lists; writes unchanged).
DROP POLICY IF EXISTS hw_staff ON homework;
CREATE POLICY hw_staff ON homework USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','hod'));
DROP POLICY IF EXISTS slot_read ON timetable_slot;
CREATE POLICY slot_read ON timetable_slot FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','hod'));

-- HOSTEL: dorm_parent reads its world + takes rollcall.
DROP POLICY IF EXISTS dorm_read ON dorm;
CREATE POLICY dorm_read ON dorm FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','patron','hod'));
DROP POLICY IF EXISTS dalloc_read ON dorm_allocation;
CREATE POLICY dalloc_read ON dorm_allocation FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','patron','hod'));
DROP POLICY IF EXISTS exeat_read ON exeat_pass;
CREATE POLICY exeat_read ON exeat_pass FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','patron','hod'));
DROP POLICY IF EXISTS rollcall_read ON hostel_rollcall;
CREATE POLICY rollcall_read ON hostel_rollcall FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','patron','hod'));
DROP POLICY IF EXISTS rollcall_write ON hostel_rollcall;
CREATE POLICY rollcall_write ON hostel_rollcall FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','dorm_parent'))
WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','dorm_parent'));

-- Laundry: dorm_parent logs moves (032 restricted writes to admin/principal/teacher).
DROP POLICY IF EXISTS laundry_read ON laundry_custody;
CREATE POLICY laundry_read ON laundry_custody FOR SELECT USING (true);
DROP POLICY IF EXISTS laundry_write ON laundry_custody;
CREATE POLICY laundry_write ON laundry_custody FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher','dorm_parent'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher','dorm_parent'));

-- FACILITIES: janitor sees + files repairs (writes still leaders-only for
-- state transitions — the janitor Today is read-and-report; Mark-done stays
-- admin/principal until an assignment model exists).
DROP POLICY IF EXISTS repair_read ON repair_report;
CREATE POLICY repair_read ON repair_report FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','janitor','dorm_parent','patron','hod'));
DROP POLICY IF EXISTS repair_any_insert ON repair_report;
CREATE POLICY repair_any_insert ON repair_report FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','janitor'));

-- SECTIONS/HOUSES: patron reads sections + awards points (leader write paths
-- from 023 already fire on head_staff_id; the role grants the read).
DROP POLICY IF EXISTS section_staff_read ON section;
CREATE POLICY section_staff_read ON section FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','librarian','patron','hod'));
DROP POLICY IF EXISTS section_member_read ON section_member;
CREATE POLICY section_member_read ON section_member FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','librarian','patron','hod'));
DROP POLICY IF EXISTS section_session_read ON section_session;
CREATE POLICY section_session_read ON section_session FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','librarian','patron','hod'));
DROP POLICY IF EXISTS section_mark_read ON section_session_mark;
CREATE POLICY section_mark_read ON section_session_mark FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','janitor','librarian','patron','hod'));
DROP POLICY IF EXISTS house_points_write ON house_points;
CREATE POLICY house_points_write ON house_points FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher','patron'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher','patron'));

-- LIBRARY: librarian runs the desk (002's loan_counter predates the role).
DROP POLICY IF EXISTS loan_counter ON library_loan;
CREATE POLICY loan_counter ON library_loan USING (
  current_setting('app.role', true) IN ('admin','principal','counter','teacher','librarian'));

-- WELFARE: dorm_parent reads incident feeds.
DROP POLICY IF EXISTS disc_staff_read ON discipline_incident;
CREATE POLICY disc_staff_read ON discipline_incident FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','dorm_parent','patron','hod')
  OR EXISTS (SELECT 1 FROM learner_guardian lg
             WHERE lg.learner_id = discipline_incident.learner_id
               AND lg.guardian_id = current_setting('app.guardian_id', true)::uuid));

-- STORE: janitor + patron see supply/kit levels (stock read list).
DROP POLICY IF EXISTS stock_counter ON stock_item;
CREATE POLICY stock_counter ON stock_item USING (
  current_setting('app.role', true) IN
    ('admin','principal','bursar','counter','janitor','patron','dorm_parent','librarian'));
