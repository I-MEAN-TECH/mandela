-- ============================================================================
-- MANDELA - 016 FEE RULES (sibling discounts - instalment plans)
-- Blueprint module 12 (docs/ADMIN-BLUEPRINT.md) + docs/FEE-REALITY-CHECK.md:
-- fees are family money in private schools. Siblings share a payer; balances
-- are measured against instalment schedules, not a single due date.
-- Discounts and plans are DATA over the existing fee/payment tables - the
-- allocation math (v_fee_balance) is untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) SIBLING DISCOUNT — a rule the school sets; applied at billing time
--    (manual-first law: bulk-apply ASSISTS, it never runs silent).
--    scope_class NULL = applies school-wide.
-- ---------------------------------------------------------------------------
CREATE TABLE sibling_discount (
  id          serial PRIMARY KEY,
  name        text NOT NULL,                        -- 'Second child 10%'
  scope_class int REFERENCES class(id) ON DELETE CASCADE,  -- NULL = all classes
  applies_from int NOT NULL,                        -- the Nth child (2 = second)
  percent_off numeric NOT NULL CHECK (percent_off > 0 AND percent_off <= 100),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (applies_from >= 2)
);
CREATE INDEX idx_sibling_discount_scope ON sibling_discount(scope_class, active);

-- ---------------------------------------------------------------------------
-- 2) INSTALMENT PLAN — a named schedule (3 terms in one, or monthly x3).
--    Plans are per-learner instances: schedule + coverage of what was billed.
-- ---------------------------------------------------------------------------
CREATE TABLE instalment_plan (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  term_id    int  NOT NULL REFERENCES term(id) ON DELETE CASCADE,
  name       text NOT NULL,                         -- 'Term plan · 3 parts'
  created_by uuid NOT NULL REFERENCES staff(id),    -- the bursar/admin who set it
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, term_id)                       -- one live plan per learner-term
);

CREATE TABLE instalment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES instalment_plan(id) ON DELETE CASCADE,
  seq         int  NOT NULL CHECK (seq > 0),         -- 1st, 2nd, 3rd part
  label       text NOT NULL,                         -- 'By half-term'
  due_on      date NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),    -- cents; parts needn't sum to billed
  paid_at     timestamptz,                           -- set when matched by a payment
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  UNIQUE (plan_id, seq)
);
CREATE INDEX idx_instalment_due ON instalment(due_on) WHERE paid_at IS NULL;

-- RLS: read staff-wide (bursar needs plans to advise collection); write
-- admin/principal/bursar — the bursar negotiates plans daily with parents.
CREATE POLICY instalment_staff_sel ON instalment_plan FOR SELECT USING (true);
CREATE POLICY instalment_staff_ins ON instalment_plan FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY instalment_staff_del ON instalment_plan FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));

CREATE POLICY instalment_sel ON instalment FOR SELECT USING (true);
CREATE POLICY instalment_ins ON instalment FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY instalment_upd ON instalment FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
CREATE POLICY instalment_del ON instalment FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal','bursar'));
