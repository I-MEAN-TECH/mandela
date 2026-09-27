-- ============================================================================
-- MANDELA - 020 PAYROLL (7)
-- Phase 2 (docs/BUILD-PHASES.md; blueprint 331). Kenya private-school
-- reality: three staff populations, one system. TSC-seconded teachers are
-- on the register but state-paid - the run skips them WITH a reason.
-- Rates are versioned DATA (they change yearly), seeded by us like
-- curriculum packs; schools cannot edit the law.
-- ASCII-only comments (Windows WIN1252 console encoding).
-- ============================================================================

-- staff_contract: no active contract = run skips + records why.
-- populations: 'bom' (BOM/board-employed) | 'term' (term-contract, matron,
-- coach, casuals). TSC-seconded staff simply have NO contract row.
CREATE TABLE IF NOT EXISTS staff_contract (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  population     text NOT NULL CHECK (population IN ('bom','term')),
  basic_cents    bigint NOT NULL CHECK (basic_cents >= 0),
  frequency      text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','termly')),
  allowances     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"transport_cents":300000,...}
  effective_from date NOT NULL,
  effective_to   date,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_staff ON staff_contract(staff_id, active);

-- statutory_rates: kind + period + params jsonb + source. Versioned yearly.
CREATE TABLE IF NOT EXISTS statutory_rates (
  id      serial PRIMARY KEY,
  kind    text NOT NULL,           -- 'paye','shif','housing','nssf','nita','relief'
  period  text NOT NULL,           -- '2026' (year) - new year = new rows
  params  jsonb NOT NULL,
  source  text NOT NULL,
  UNIQUE (kind, period)
);

-- 2026 Kenya rates (research 2026-09-12; KRA bands post-2024 tax laws).
-- One ON CONFLICT at the END of the statement (it is not per-row).
INSERT INTO statutory_rates (kind, period, params, source) VALUES
  ('paye', '2026',
   '{"bands":[{"up_to":288000,"rate":0.10},{"up_to":388000,"rate":0.25},{"up_to":6000000,"rate":0.30},{"up_to":9600000,"rate":0.32},{"rate":0.35}]}',
   'KRA PAYE bands, annualized income'),
  ('relief', '2026', '{"annual_cents":2880000}', 'Personal relief KES 2,400/month'),
  ('shif', '2026', '{"rate":0.0275,"min_cents":30000, "employer":0}', 'SHIF 2.75% of gross, min KES 300/mo'),
  ('housing', '2026', '{"employee":0.015,"employer":0.015}', 'Housing Levy 1.5% + 1.5%'),
  ('nssf', '2026',
   '{"tier1":{"up_to":800000,"rate":0.06},"tier2":{"up_to":7200000,"rate":0.06},"employer_match":true}',
   'NSSF Act 2013: Tier I up to 8,000/mo, Tier II 8,001-72,000/mo, 6%+6%'),
  ('nita', '2026', '{"per_year_cents":5000}', 'NITA KES 50/employee/month training levy')
ON CONFLICT (kind, period) DO NOTHING;

-- payroll_run: one per month; draft -> computed -> approved -> disbursed.
CREATE TYPE payroll_state AS ENUM ('draft','computed','approved','disbursed');

CREATE TABLE IF NOT EXISTS payroll_run (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period        text NOT NULL UNIQUE,   -- '2026-09'
  state         payroll_state NOT NULL DEFAULT 'draft',
  working_days  int  NOT NULL DEFAULT 26,
  computed_at   timestamptz,
  approved_by   uuid REFERENCES staff(id),
  approval_id   uuid,                   -- approval_request link (Inbox 36)
  disbursed_at  timestamptz,
  disbursed_how text,                   -- 'bank-file' | 'manual' | 'mpesa'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_payroll_touch BEFORE UPDATE ON payroll_run
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- payslip: computed lines, one per contracted staff per run.
CREATE TABLE IF NOT EXISTS payslip (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL REFERENCES payroll_run(id) ON DELETE CASCADE,
  staff_id       uuid NOT NULL REFERENCES staff(id),
  contract_id    uuid NOT NULL REFERENCES staff_contract(id),
  days_worked    int NOT NULL DEFAULT 26,
  basic_cents    bigint NOT NULL,          -- prorated
  allowances     jsonb NOT NULL DEFAULT '{}'::jsonb,
  gross_cents    bigint NOT NULL,
  taxable_cents  bigint NOT NULL,
  paye_cents     bigint NOT NULL,
  relief_cents   bigint NOT NULL DEFAULT 0,
  shif_cents     bigint NOT NULL,
  housing_cents  bigint NOT NULL,
  nssf_cents     bigint NOT NULL,          -- employee tier1+tier2
  other_cents    bigint NOT NULL DEFAULT 0,-- payslip_deduction total
  net_cents      bigint NOT NULL,
  skipped_reason text,                     -- NULL = paid row; TSC rows are NOT here
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

-- payslip_deduction: HELB, advances, welfare - bursar-entered, audited.
CREATE TABLE IF NOT EXISTS payslip_deduction (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id  uuid NOT NULL REFERENCES payslip(id) ON DELETE CASCADE,
  label       text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS. Payroll is the most sensitive read in the system:
--   admin + bursar: full access
--   every staff: OWN payslip only (self-pay view)
--   others (teacher/principal/counter/driver roles as staff rows): none of others'
ALTER TABLE staff_contract    ENABLE ROW LEVEL SECURITY;
ALTER TABLE statutory_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_deduction ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_ledger_read ON staff_contract FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY contract_ledger_write ON staff_contract FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY contract_ledger_upd ON staff_contract FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','bursar'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','bursar'));

-- Rates: everyone reads the law; nobody writes it through the app.
CREATE POLICY rates_read ON statutory_rates FOR SELECT USING (true);

CREATE POLICY run_read ON payroll_run FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY run_write ON payroll_run FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY run_upd ON payroll_run FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','bursar'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','bursar'));

-- Payslips: payroll roles see all; any staff session sees OWN rows only.
CREATE POLICY payslip_ledger_read ON payslip FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY payslip_self_read ON payslip FOR SELECT USING (
  current_setting('app.role', true) IN ('teacher','principal','counter','driver','admin','bursar')
  AND staff_id::text = current_setting('app.staff_id', true));

CREATE POLICY slipded_read ON payslip_deduction FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY slipded_write ON payslip_deduction FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','bursar'));
