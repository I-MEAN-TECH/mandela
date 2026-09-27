-- ============================================================================
-- MANDELA — 011 ADMIN OPS (staff register fields, governance, allocations)
-- docs/ADMIN-DASHBOARD.md §3.1 + docs/FEE-REALITY-CHECK.md
--   * staff.tsc_no / staff.national_id — Kenyan register fields (§0 research)
--   * last-active-principal guard — DB-layer invariant (layer 2 of 3)
--   * payment_allocation — every payment attributable to fee items from day
--     one (UI may still show totals only)
-- ============================================================================

-- Kenyan register fields every audit asks for. TSC requires private schools
-- to employ only registered teachers — tsc_no is a licence-protection field.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tsc_no      text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS national_id text;

-- Last-active-principal guard: the school must never lock itself out.
CREATE OR REPLACE FUNCTION prevent_last_principal_demotion() RETURNS trigger AS $$
BEGIN
  IF (NEW.role <> 'principal' OR NEW.active = false)
     AND (OLD.role = 'principal' AND OLD.active) THEN
    IF (SELECT count(*) FROM staff
        WHERE role = 'principal' AND active AND id <> NEW.id) = 0 THEN
      RAISE EXCEPTION 'cannot demote or deactivate the last active principal';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_guard ON staff;
CREATE TRIGGER trg_staff_guard BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION prevent_last_principal_demotion();

-- Payment allocation: how a payment splits across fee items (oldest first is
-- an API convention; the DB only guarantees positive cents + uniqueness).
CREATE TABLE IF NOT EXISTS payment_allocation (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  fee_item_id  uuid NOT NULL REFERENCES fee_item(id) ON DELETE RESTRICT,
  amount       bigint NOT NULL CHECK (amount > 0),   -- cents; sum <= payment.amount
  allocated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, fee_item_id)
);
CREATE INDEX IF NOT EXISTS idx_alloc_item ON payment_allocation(fee_item_id);

-- RLS: staff money-roles see all allocations; guardians see allocations of
-- their children's payments (same reach as the payments policy).
ALTER TABLE payment_allocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY alloc_staff ON payment_allocation FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter')
);
CREATE POLICY alloc_guardian ON payment_allocation FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM payments p
    WHERE p.id = payment_id
      AND p.learner_id IN (SELECT app_guardian_learner_ids())
  )
);
CREATE POLICY alloc_write ON payment_allocation FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter')
  OR EXISTS (
    SELECT 1 FROM payments p
    WHERE p.id = payment_id
      AND p.learner_id IN (SELECT app_guardian_learner_ids())
  )
);
