-- ============================================================================
-- MANDELA - 028 LIFECYCLE + PLATFORM (docs/MASTER-CHECKLIST.md final flank)
-- Everything left open in the checklist, one sweep. ASCII-only (WIN1252).
--
--   19  HOUSES: points ledger on section(kind='house'); competitions stay
--       school_event rows (audience filter) - no new engine.
--   18  DUTY ROSTERS: recurring weekly assignments (the "when" of who).
--   16/31  DOCUMENTS VAULT + TEMPLATES: per-entity files + template-driven
--       transfer certs / admission letters / ID cards, issued copies filed.
--   23  POCKET MONEY & LAUNDRY: wallet txns on the same audit discipline as
--       petty cash; laundry is a spend category per boarder.
--    9  LOGIN CODES (OTP): short-lived codes; the real better-auth swap
--       consumes them server-side. Dev returns the code, prod sends it.
--   13  SWITCHING IMPORT: competitor-export staging (raw -> mapped -> imported).
--    5/6  PAYSLIP CONFIRM + DISBURSEMENT RECONCILIATION ALTERs.
--   14  ACTIVITY/EVENT SECTION LINKS: fee_item + school_event gain section_id
--       (co-curricular fees and fixtures fall out of existing engines).
--    2  ALUMNI RLS: alumni_profile had no explicit policies.
--   12  MEDIA CONSENT: no DDL - consent.subject_type 'photo_publish' covers
--       it; the desk UI + announcement filter land in the app layer.
--
-- RLS follows the house role-based pattern (024-027). Auditing stays in the
-- API layer (house convention).
-- ============================================================================

-- ---------------------------------------------------------------- 19 HOUSE POINTS
CREATE TABLE IF NOT EXISTS house_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id    uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  points      int  NOT NULL,                       -- +/- allowed (deductions)
  reason      text NOT NULL,
  learner_id  uuid REFERENCES learner(id) ON DELETE SET NULL,
  awarded_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_house_points_house ON house_points(house_id, created_at DESC);

-- ---------------------------------------------------------------- 18 DUTY ROSTER
CREATE TABLE IF NOT EXISTS duty_roster (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday     int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- JS getDay: 0=Sun
  slot        text NOT NULL CHECK (slot IN ('morning','break','lunch','evening','night')),
  duty        text NOT NULL,                          -- 'Gate supervision', 'Dorm rounds'
  place       text,                                   -- 'Main gate', 'Elgon dorm'
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, weekday, slot, duty)
);

-- ---------------------------------------------------------------- 16/31 DOCUMENT VAULT
CREATE TABLE IF NOT EXISTS doc_template (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,                -- 'transfer-cert','admission-letter','id-card'
  name       text NOT NULL,
  body_md    text NOT NULL,                       -- {{placeholders}} filled at issue time
  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  kind          text NOT NULL DEFAULT 'other'
                CHECK (kind IN ('certificate','letter','id-card','report','board-pack','hr','policy','other')),
  entity_type   text,                              -- 'learner','staff','board','school'
  entity_id     text,                              -- uuid or 'school'
  template_code text,
  storage_key   text,                              -- MinIO/S3 key (dev: reference only)
  body_md       text,                              -- rendered copy for template docs
  issued_by     uuid REFERENCES staff(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_entity ON document(entity_type, entity_id);

-- ---------------------------------------------------------------- 23 POCKET MONEY
CREATE TABLE IF NOT EXISTS pocket_txn (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  direction  text NOT NULL CHECK (direction IN ('topup','spend','laundry','reimburse')),
  amount     bigint NOT NULL CHECK (amount > 0),   -- cents
  note       text,
  taken_by   uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pocket_learner ON pocket_txn(learner_id, created_at DESC);

-- ---------------------------------------------------------------- 9 LOGIN CODES
CREATE TABLE IF NOT EXISTS login_code (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text NOT NULL,                       -- email or normalized phone
  purpose     text NOT NULL CHECK (purpose IN ('staff','guardian')),
  code        text NOT NULL,                       -- 6-digit; dev echoes, prod sends
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at timestamptz,
  attempts    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_code_ident ON login_code(identifier, purpose, created_at DESC);

-- ---------------------------------------------------------------- 13 SWITCHING IMPORT
CREATE TABLE IF NOT EXISTS switching_import (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL,                       -- 'solva','excel-template','csv-generic'
  filename    text,
  raw         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- unparsed rows as-received
  mapped      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- mapped learner rows (our column names)
  errors      jsonb NOT NULL DEFAULT '[]'::jsonb,
  state       text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','mapped','imported','failed')),
  imported_count int NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- ALTERs
ALTER TABLE payslip     ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE payslip     ADD COLUMN IF NOT EXISTS confirm_note text;
ALTER TABLE payroll_run ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE payroll_run ADD COLUMN IF NOT EXISTS reconciled_note text;

ALTER TABLE fee_item    ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES section(id) ON DELETE SET NULL;
ALTER TABLE school_event ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES section(id) ON DELETE SET NULL;
ALTER TABLE admission_inquiry ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'walk-in';

-- ---------------------------------------------------------------- 14 TEMPLATES SEED
INSERT INTO doc_template (code, name, body_md)
VALUES
  ('transfer-cert', 'Transfer Certificate',
   E'# TRANSFER CERTIFICATE\n\nThis is to certify that **{{learner_name}}** (Adm No. {{adm_no}}),\nlast of **{{class_name}}**, has left {{school_name}} on {{issue_date}}.\n\nConduct: {{conduct}}\nFees status: {{fees_status}}\n\n________________________\n{{issuer_name}} - {{issuer_role}}\n{{school_name}} · {{school_county}}'),
  ('admission-letter', 'Admission Letter',
   E'{{school_name}}\n{{issue_date}}\n\nDear {{guardian_name}},\n\nWe are pleased to offer **{{learner_name}}** a place in **{{class_name}}**\ncommencing {{reporting_date}}. Admission number: **{{adm_no}}**.\n\nFee balance on reporting: {{fees_due}}\n\nYours faithfully,\n{{issuer_name}} - {{issuer_role}}'),
  ('id-card', 'Student ID Card',
   E'{{school_name}}\n\n**{{learner_name}}**\nAdm No. {{adm_no}} · {{class_name}}\nValid: {{valid_to}}')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- RLS (house pattern)
ALTER TABLE house_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS house_points_read ON house_points;
CREATE POLICY house_points_read ON house_points FOR SELECT USING (true);
DROP POLICY IF EXISTS house_points_write ON house_points;
CREATE POLICY house_points_write ON house_points FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));

ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS duty_roster_read ON duty_roster;
CREATE POLICY duty_roster_read ON duty_roster FOR SELECT USING (true);
DROP POLICY IF EXISTS duty_roster_write ON duty_roster;
CREATE POLICY duty_roster_write ON duty_roster FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE doc_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_template_read ON doc_template;
CREATE POLICY doc_template_read ON doc_template FOR SELECT USING (true);
DROP POLICY IF EXISTS doc_template_write ON doc_template;
CREATE POLICY doc_template_write ON doc_template FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE document ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_read ON document;
CREATE POLICY document_read ON document FOR SELECT USING (true);
DROP POLICY IF EXISTS document_write ON document;
CREATE POLICY document_write ON document FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- Money-touching: admin/bursar/counter operate wallets.
ALTER TABLE pocket_txn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pocket_read ON pocket_txn;
CREATE POLICY pocket_read ON pocket_txn FOR SELECT USING (true);
DROP POLICY IF EXISTS pocket_write ON pocket_txn;
CREATE POLICY pocket_write ON pocket_txn FOR ALL
  USING (current_setting('app.role', true) IN ('admin','bursar','counter'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','bursar','counter'));

-- Login codes: written pre-session by the login flow (no app.role set), so the
-- policy allows the insert; codes are never SELECTed into any response.
ALTER TABLE login_code ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_code_all ON login_code;
CREATE POLICY login_code_all ON login_code FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE switching_import ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS switch_read ON switching_import;
CREATE POLICY switch_read ON switching_import FOR SELECT USING (true);
DROP POLICY IF EXISTS switch_write ON switching_import;
CREATE POLICY switch_write ON switching_import FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- 2 Alumni: explicit policies (the 001 table predates the RLS tighten pass).
ALTER TABLE alumni_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alumni_read ON alumni_profile;
CREATE POLICY alumni_read ON alumni_profile FOR SELECT USING (true);
DROP POLICY IF EXISTS alumni_write ON alumni_profile;
CREATE POLICY alumni_write ON alumni_profile FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
