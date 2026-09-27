-- ============================================================================
-- MANDELA  022 MONEY RAILS + CLASSROOM OVERSIGHT + GOVERNANCE CLUSTER
-- Phase 2 batch (docs/BUILD-PHASES.md):
--    Money Rails     bank_csv_import + rails_match: Daraja C2B and bank
--                      CSV both land as SUGGESTIONS; the bursar confirms in
--                      one tap or keys by hand. Manual-first law holds.
--    Report cards    report_card rows (per learner × term): scores come
--                      from assessment; state: draft  approved  issued.
--    Permissions    perm_matrix: module × role ownership as DATA, seeded
--     Matrix          with two-leaders defaults; shapes nav/prompts only
--                      (hardcoded role checks stay as the security floor).
--    Duties         staff_duty: every hat (deputy, discipline master, HOD,
--                      patron-of) as scope-carrying rows, audited.
--    Integrations   integration_health: connection status for school rails;
--                      SECRETS NEVER LIVE HERE (platform-side only).
-- ============================================================================

-- ------------------------------  Money Rails ------------------------------
CREATE TABLE IF NOT EXISTS bank_csv_import (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name    text NOT NULL,
  row_count    int NOT NULL DEFAULT 0,
  matched_ct   int NOT NULL DEFAULT 0,
  imported_by  uuid REFERENCES staff(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- A raw statement line, or a Daraja C2B callback, becomes ONE suggestion row.
-- state: 'suggested'  'confirmed' (payment row created) | 'dismissed'.
-- source: 'bank-csv' | 'daraja-c2b'. mpesa_txn link dedupes callbacks.
CREATE TABLE IF NOT EXISTS rails_match (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL CHECK (source IN ('bank-csv','daraja-c2b')),
  import_id     uuid REFERENCES bank_csv_import(id) ON DELETE CASCADE,
  mpesa_txn_id  uuid UNIQUE REFERENCES mpesa_txn(id),
  payer_name    text,
  payer_ref     text,                        -- the story: payslip no, name part
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  paid_on       date NOT NULL,
  suggested_learner_id uuid REFERENCES learner(id),
  match_score   numeric(4,3),                -- 1.000 exact ref, lower = fuzzy
  match_reason  text,
  state         text NOT NULL DEFAULT 'suggested' CHECK (state IN ('suggested','confirmed','dismissed')),
  payment_id    uuid UNIQUE REFERENCES payments(id),  -- set on confirm
  created_by    uuid REFERENCES staff(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rails_open ON rails_match(state, paid_on DESC);

-- -------------------------  Exams & Report Cards ---------------------------
CREATE TABLE IF NOT EXISTS report_card (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  term_id     int NOT NULL REFERENCES term(id) ON DELETE RESTRICT,
  class_id    int REFERENCES class(id),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- rendered rows at issue time
  state       text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','issued')),
  generated_by uuid REFERENCES staff(id),
  approved_by uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (learner_id, term_id)
);

-- -----------------------------  Permissions -------------------------------
CREATE TABLE IF NOT EXISTS perm_matrix (
  id          serial PRIMARY KEY,
  module_key  text NOT NULL,                 -- 'people', 'money', 'exams', 
  role        user_role NOT NULL,
  owns        boolean NOT NULL DEFAULT false, -- acts/prompted to act
  sees        boolean NOT NULL DEFAULT true,  -- nav visibility above the floor
  landing     boolean NOT NULL DEFAULT false, -- this module is the role's home tab
  updated_by  uuid REFERENCES staff(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, role)
);

-- Two-leaders defaults (§0.5): admin + principal own operations modules;
-- bursar owns money; teacher owns classroom marking; counter sees money reads.
INSERT INTO perm_matrix (module_key, role, owns, sees, landing) VALUES
  ('today',    'admin',     true,  true,  true ),
  ('today',    'principal', true,  true,  true ),
  ('today',    'bursar',    false, true,  false),
  ('today',    'teacher',   false, true,  false),
  ('people',   'admin',     true,  true,  false),
  ('people',   'principal', true,  true,  true ),
  ('people',   'bursar',    false, true,  false),
  ('people',   'teacher',   false, true,  false),
  ('money',    'admin',     true,  true,  false),
  ('money',    'bursar',    true,  true,  true ),
  ('money',    'principal', false, true,  false),
  ('money',    'counter',   false, true,  true ),
  ('academics','principal', true,  true,  false),
  ('academics','teacher',   true,  true,  false),
  ('academics','admin',     false, true,  false),
  ('operations','admin',    true,  true,  false),
  ('operations','principal',false, true,  false),
  ('insights', 'admin',     true,  true,  false),
  ('insights', 'principal', true,  true,  false),
  ('insights', 'bursar',    false, true,  false),
  ('settings', 'admin',     true,  true,  true ),
  ('settings', 'principal', false, true,  false)
ON CONFLICT (module_key, role) DO NOTHING;

-- -------------------------------  Duties ----------------------------------
CREATE TABLE IF NOT EXISTS staff_duty (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  duty_key      text NOT NULL,   -- deputy · discipline · counselling · hod-<dep>
                               -- exams-officer · class-teacher-of:<classId>
                               -- patron-of:<sectionId> · librarian · dorm-parent-of:<dorm>
  scope_id      text,            -- class/section/dorm id when the hat carries one
  label         text NOT NULL,   -- human wording for the screen
  appointed_by  uuid REFERENCES staff(id),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to  date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, duty_key, effective_from)
);

-- -----------------------------  Integrations ------------------------------
-- Status ONLY. Credentials stay in the platform control plane, never here.
CREATE TABLE IF NOT EXISTS integration_health (
  key         text PRIMARY KEY,    -- whatsapp · sms · mpesa-daraja · email
  label       text NOT NULL,
  connected   boolean NOT NULL DEFAULT false,
  last_ok_at  timestamptz,
  note        text,
  updated_by  uuid REFERENCES staff(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO integration_health (key, label, connected, note) VALUES
  ('whatsapp', 'WhatsApp (Talk worker)', false, 'Connect at platform level; status shown here'),
  ('sms',      'SMS fallback',           false, NULL),
  ('mpesa',    'M-Pesa Daraja (C2B)',    false, 'Paybill + credentials live platform-side'),
  ('email',    'Email',                  false, NULL)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------- RLS -------------------------------------
ALTER TABLE bank_csv_import     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rails_match         ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card         ENABLE ROW LEVEL SECURITY;
ALTER TABLE perm_matrix         ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_duty          ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health  ENABLE ROW LEVEL SECURITY;

-- Money rails: money roles full; other staff none; guardians never (table has
-- no learner-facing surface  balances are, statements aren't raw rails data).
CREATE POLICY rails_admin_rw ON bank_csv_import FOR ALL USING (
  current_setting('app.role', true) IN ('admin','bursar'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY rails_match_rw ON rails_match FOR ALL USING (
  current_setting('app.role', true) IN ('admin','bursar'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','bursar'));

-- Report cards: staff read; principal/admin + teacher(generate) write;
-- guardians read own child's issued card via a dedicated endpoint policy.
CREATE POLICY rc_staff_read ON report_card FOR SELECT USING (
  current_setting('app.role', true) IS NOT NULL);
CREATE POLICY rc_staff_write ON report_card FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher'));
CREATE POLICY rc_staff_upd ON report_card FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- Matrix: everyone reads (nav shaping is per-session); admin writes.
CREATE POLICY perm_read ON perm_matrix FOR SELECT USING (true);
CREATE POLICY perm_write ON perm_matrix FOR ALL USING (
  current_setting('app.role', true) = 'admin')
  WITH CHECK (current_setting('app.role', true) = 'admin');

-- Duties: staff read (conditional surfaces resolve "who"); admin/principal write.
CREATE POLICY duty_read ON staff_duty FOR SELECT USING (
  current_setting('app.role', true) IS NOT NULL);
CREATE POLICY duty_write ON staff_duty FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- Integrations: staff read; admin toggles.
CREATE POLICY integ_read ON integration_health FOR SELECT USING (
  current_setting('app.role', true) IS NOT NULL);
CREATE POLICY integ_write ON integration_health FOR UPDATE USING (
  current_setting('app.role', true) = 'admin')
  WITH CHECK (current_setting('app.role', true) = 'admin');

-- ------------------------------ NAV: Operations -----------------------------
-- The Operations group enters the sidebar for admin/principal (Facilities &
-- Maintenance  lands Phase 3; the group appears when its first child does).
-- Insert-before "Insights"; idempotent; skip if present or customized away.
UPDATE school_settings
SET nav_json = jsonb_set(nav_json, '{admin}', (
  SELECT jsonb_agg(x ORDER BY ord)
  FROM (
    SELECT v AS x, ord * 2 AS ord
    FROM jsonb_array_elements(nav_json->'admin') WITH ORDINALITY e(v, ord)
    WHERE v <> '"Operations"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, (ord - 1) * 2
    FROM jsonb_array_elements(nav_json->'admin') WITH ORDINALITY e(v, ord)
    WHERE v = '"Insights"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, 1000
    WHERE NOT (nav_json->'admin') @> '["Insights"]'::jsonb
  ) s
))
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'admin') = 'array'
  AND NOT (nav_json->'admin') @> '["Operations"]'::jsonb;

UPDATE school_settings
SET nav_json = jsonb_set(nav_json, '{principal}', (
  SELECT jsonb_agg(x ORDER BY ord)
  FROM (
    SELECT v AS x, ord * 2 AS ord
    FROM jsonb_array_elements(nav_json->'principal') WITH ORDINALITY e(v, ord)
    WHERE v <> '"Operations"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, (ord - 1) * 2
    FROM jsonb_array_elements(nav_json->'principal') WITH ORDINALITY e(v, ord)
    WHERE v = '"Insights"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, 1000
    WHERE NOT (nav_json->'principal') @> '["Insights"]'::jsonb
  ) s
))
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'principal') = 'array'
  AND NOT (nav_json->'principal') @> '["Operations"]'::jsonb;
