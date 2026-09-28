-- 051 — Pulse cross-role reads (two narrow gaps the wave-2 Today work found).
--   1. staff SELECT was self-only (012): any pulse that JOINs staff to name
--      other teachers dropped their rows for non-leadership sessions (HOD's
--      "unmarked by teacher"). All staff roles get the directory-level read;
--      sensitive columns keep their own policies, writes unchanged.
--   2. learner read excluded driver (037 listed the wave-1/2 roles but not
--      driver): the driver's manifest JOIN dropped learner names. Driver gets
--      a directory-level learner read (names + classes only reach the UI;
--      DPA surfaces like infirmary/conduct keep their own strict policies).

DROP POLICY IF EXISTS staff_dir_read ON staff;
CREATE POLICY staff_dir_read ON staff FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver',
     'dorm_parent','janitor','librarian','patron','hod'));

DROP POLICY IF EXISTS learner_staff_read ON learner;
CREATE POLICY learner_staff_read ON learner FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver',
     'dorm_parent','janitor','librarian','patron','hod'));
