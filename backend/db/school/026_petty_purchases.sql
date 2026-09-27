-- ============================================================================
-- MANDELA - 026 PETTY CASH & BUDGETS (15) + PURCHASES & SUPPLIERS (33)
-- Phase 3 (docs/BUILD-PHASES.md). ASCII-only comments (WIN1252).
--
--   15 PETTY CASH: one ledger, two directions - float IN (top-ups from the
--     office) and spend OUT (the bursar's till). Every spend carries a cost
--     center; approval gates spends above the petty threshold. Budgets per
--     cost center per term: budget vs actual is a read, not a model.
--   33 PURCHASES: supplier register + purchase_request (raised here or via
--     the approvals inbox 36). State machine: draft -> submitted -> approved
--     -> ordered -> received -> paid, with cancel. Bills received feed the
--     supplier ledger; nothing is paid silently.
-- ============================================================================

-- --------------------------- 15 PETTY CASH ----------------------------------
CREATE TYPE pc_direction AS ENUM ('topup','spend','reimburse');
CREATE TYPE pc_state     AS ENUM ('pending','approved','rejected','settled');

CREATE TABLE IF NOT EXISTS petty_cash (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction    pc_direction NOT NULL,
  state        pc_state NOT NULL DEFAULT 'approved',
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  cost_center  text NOT NULL DEFAULT 'general',
  description  text NOT NULL DEFAULT '',
  spent_on     date NOT NULL DEFAULT CURRENT_DATE,
  raised_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  approved_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  decision_reason text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_dates ON petty_cash(spent_on);
CREATE INDEX IF NOT EXISTS idx_pc_state ON petty_cash(state);

CREATE TRIGGER trg_pc_touch BEFORE UPDATE ON petty_cash
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE petty_cash ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_read ON petty_cash FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY pc_write ON petty_cash FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','bursar'));
CREATE POLICY pc_update ON petty_cash FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'));

-- Budgets per cost center per term.
CREATE TABLE IF NOT EXISTS pc_budget (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id      int NOT NULL REFERENCES term(id) ON DELETE CASCADE,
  cost_center  text NOT NULL,
  budget_cents bigint NOT NULL CHECK (budget_cents >= 0),
  note         text,
  created_by   uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, cost_center)
);

ALTER TABLE pc_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcb_read ON pc_budget FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY pcb_write ON pc_budget FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- --------------------------- 33 PURCHASES & SUPPLIERS ------------------------
CREATE TABLE IF NOT EXISTS supplier (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  phone        text,
  email        citext,
  category     text NOT NULL DEFAULT 'general',   -- 'food','stationery','fuel','repairs','services','general'
  active       boolean NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_supplier_touch BEFORE UPDATE ON supplier
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_read ON supplier FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter'));
CREATE POLICY supplier_write ON supplier FOR ALL USING (
  current_setting('app.role', true) IN ('admin','bursar'))
WITH CHECK (current_setting('app.role', true) IN ('admin','bursar'));

CREATE TYPE pr_state AS ENUM ('draft','submitted','approved','ordered','received','paid','cancelled');

CREATE TABLE IF NOT EXISTS purchase_request (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text NOT NULL,                    -- human ref: PR-001
  supplier_id   uuid REFERENCES supplier(id) ON DELETE SET NULL,
  title         text NOT NULL,
  cost_center   text NOT NULL DEFAULT 'general',
  est_cents     bigint NOT NULL DEFAULT 0 CHECK (est_cents >= 0),
  state         pr_state NOT NULL DEFAULT 'draft',
  requested_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  decided_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  decision_reason text NOT NULL DEFAULT '',
  decided_at    timestamptz,
  received_at   timestamptz,
  paid_at       timestamptz,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pr_state ON purchase_request(state);
CREATE INDEX IF NOT EXISTS idx_pr_supplier ON purchase_request(supplier_id);

CREATE TRIGGER trg_pr_touch BEFORE UPDATE ON purchase_request
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE purchase_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_read ON purchase_request FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter'));
CREATE POLICY pr_insert ON purchase_request FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY pr_update ON purchase_request FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));

-- Auto-mint human refs PR-nnn on first insert.
CREATE OR REPLACE FUNCTION pr_next_ref() RETURNS text AS $$
  SELECT 'PR-' || lpad((coalesce(max(nullif(regexp_replace(ref, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 3, '0')
  FROM purchase_request;
$$ LANGUAGE sql;
