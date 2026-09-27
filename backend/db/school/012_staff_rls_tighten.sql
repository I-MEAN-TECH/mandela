-- ============================================================================
-- MANDELA — 012 STAFF RLS TIGHTEN (found during Admin build)
-- staff_self was a FOR ALL policy: a session could UPDATE its own staff row
-- (including role). The API layer guards today, but layer 2 must not rely on
-- layer 3. Self-access becomes read-only; writes stay admin/principal-only.
-- ============================================================================

DROP POLICY IF EXISTS staff_self ON staff;
CREATE POLICY staff_self_read ON staff FOR SELECT USING (id = app_staff_id());
