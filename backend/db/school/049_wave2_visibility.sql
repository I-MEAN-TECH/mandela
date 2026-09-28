-- 049 — Wave-2 visibility polish (§6.7–6.11 follow-up).
--   1. school_event read gains janitor/librarian/patron/dorm_parent/hod — the
--      patron's "Events this week" card and every wave-2 Today's calendar
--      strip read the same term calendar leadership sees (023 gated it to the
--      pre-wave-2 roles only).
--   2. stock_item read gains librarian — the librarian sees supply/kit levels
--      like janitor+patron (044 granted janitor/patron but skipped librarian).
-- Writes unchanged everywhere.

-- EVENTS: every staff role reads the calendar; writes stay admin/principal/teacher.
DROP POLICY IF EXISTS event_staff_read ON school_event;
CREATE POLICY event_staff_read ON school_event FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver',
     'dorm_parent','janitor','librarian','patron','hod')
  OR current_setting('app.guardian_id', true) IS NOT NULL);

-- STORE: librarian sees supply levels too (044 granted janitor + patron).
DROP POLICY IF EXISTS stock_read ON stock_item;
CREATE POLICY stock_read ON stock_item FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','bursar','counter','janitor','patron',
     'dorm_parent','librarian','hod'));
