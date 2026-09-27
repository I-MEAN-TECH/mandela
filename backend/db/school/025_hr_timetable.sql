-- ============================================================================
-- MANDELA - 025 HR & LEAVE (6) + TIMETABLE (19)
-- Phase 3 opening pair (docs/BUILD-PHASES.md). ASCII-only comments
-- (Windows WIN1252 console encoding).
--
--   6  HR & LEAVE: staff_leave ledger - annual/sick/maternity/paternity/
--      compassionate/other, per BOM contract. A request is raised by any
--      staff member (or on behalf by the admin), decided by admin or
--      principal with a mandatory reason through the SAME two-leaders
--      model as the approvals inbox. Days-taken vs entitlement is read
--      from the ledger; entitlement defaults live in staff_leave_rules.
--   19 TIMETABLE: timetable_slot - the period grid per class (day 1-7 x
--      period 1-9), optional room, tied to a learning area and a teacher.
--      Writes are admin/principal; the teacher clash check is a backend
--      guard (same day+period, another class, active slot). Reads are
--      staff-wide (the teacher dashboard and Learner 360 will consume it).
-- ============================================================================

-- --------------------------- 6 STAFF LEAVE ----------------------------------
CREATE TYPE leave_kind  AS ENUM ('annual','sick','maternity','paternity','compassionate','other');
CREATE TYPE leave_state AS ENUM ('pending','approved','rejected','cancelled');

-- Entitlement defaults (school-tunable): days per year per kind.
CREATE TABLE IF NOT EXISTS staff_leave_rules (
  kind         leave_kind PRIMARY KEY,
  days         int  NOT NULL,
  note         text
);

INSERT INTO staff_leave_rules (kind, days, note) VALUES
  ('annual',         30, 'BOM contracts: 30 working days per year'),
  ('sick',           15, 'With medical proof; extends by BOM resolution'),
  ('maternity',      90, '3 months per the Employment Act'),
  ('paternity',      14, '2 weeks per the Employment Act'),
  ('compassionate',   7, 'Bereavement / emergency - head may extend'),
  ('other',           0, 'Unpaid or study leave - zero by default; BOM decides')
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS staff_leave (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind         leave_kind NOT NULL,
  state        leave_state NOT NULL DEFAULT 'pending',
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  days         int  NOT NULL DEFAULT 1 CHECK (days > 0),
  reason       text NOT NULL DEFAULT '',
  decided_by   uuid REFERENCES staff(id),
  decision_reason text NOT NULL DEFAULT '',
  decided_at   timestamptz,
  raised_by    uuid REFERENCES staff(id),   -- who keyed it (self or admin)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS idx_leave_staff ON staff_leave(staff_id, state);
CREATE INDEX IF NOT EXISTS idx_leave_dates ON staff_leave(starts_on, ends_on);

CREATE TRIGGER trg_leave_touch BEFORE UPDATE ON staff_leave
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE staff_leave ENABLE ROW LEVEL SECURITY;
-- Read: staff see the ledger (their own rows matter; leaders see all).
CREATE POLICY leave_read ON staff_leave FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
-- Raise: any staff (self or on behalf).
CREATE POLICY leave_insert ON staff_leave FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
-- Decide: two leaders only (admin or principal).
CREATE POLICY leave_update ON staff_leave FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE staff_leave_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_rules_read ON staff_leave_rules FOR SELECT USING (true);

-- --------------------------- 19 TIMETABLE -----------------------------------
CREATE TABLE IF NOT EXISTS timetable_slot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      int NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  day_of_week   int  NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=Mon
  period        int  NOT NULL CHECK (period BETWEEN 1 AND 9),
  starts_at     text,                       -- '08:00' (display; the bell owns time)
  ends_at       text,
  area_code     text,                       -- learning area code ('ENG','MAT')
  area_name     text,
  teacher_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  room          text,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, day_of_week, period)
);
CREATE INDEX IF NOT EXISTS idx_slot_teacher ON timetable_slot(teacher_id, day_of_week, period) WHERE active;

CREATE TRIGGER trg_slot_touch BEFORE UPDATE ON timetable_slot
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE timetable_slot ENABLE ROW LEVEL SECURITY;
-- Read: every staff account (teacher home, Learner 360, clash checks).
CREATE POLICY slot_read ON timetable_slot FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
-- Write: leaders only.
CREATE POLICY slot_write ON timetable_slot FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- --------------------------- capability flag --------------------------------
INSERT INTO feature_flag (key, label, enabled, group_key) VALUES
  ('timetable', 'Timetable (period grids)', true, 'academics')
ON CONFLICT (key) DO NOTHING;
