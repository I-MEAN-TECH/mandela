-- ============================================================================
-- MANDELA - 018 COMPLIANCE CENTER (28)
-- Phase 1 (docs/BUILD-PHASES.md). Every regulatory line on one screen with
-- countdowns (blueprint 632): KEMIS candidate registration + TSC coverage
-- compute live from kemisReadiness(); the county-licence checklist rows live
-- here - admin edits due dates and marks them done, every change audited.
-- ASCII-only comments (Windows WIN1252 console encoding).
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_line (
  id          serial PRIMARY KEY,
  key         text NOT NULL UNIQUE,      -- 'kemis-registration','tsc-registration','county-licence'
  label       text NOT NULL,
  due_date    date,
  note        text,
  done        boolean NOT NULL DEFAULT false,  -- manual lines only (licence)
  position    int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_compliance_touch BEFORE UPDATE ON compliance_line
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO compliance_line (key, label, due_date, note, position) VALUES
  ('kemis-registration', 'KEMIS candidate registration', '2027-03-31',
   'Every active learner needs UPI + birth cert + guardian. The fix list lives in Exam Entries.', 0),
  ('tsc-registration', 'TSC teacher registration', '2026-12-31',
   'Private schools may employ only registered teachers - every teacher needs a TSC number + National ID.', 1),
  ('county-licence', 'County licence renewal', '2026-12-31',
   'Renewal asks for the same learner/staff data. Documents move to the Vault when it lands.', 2)
ON CONFLICT (key) DO NOTHING;

-- RLS: all staff see the center (it is a readiness glance); writes are
-- admin/principal only.
ALTER TABLE compliance_line ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_read ON compliance_line FOR SELECT USING (true);
CREATE POLICY compliance_admin_ins ON compliance_line FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY compliance_admin_upd ON compliance_line FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY compliance_admin_del ON compliance_line FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal'));
