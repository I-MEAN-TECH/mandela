-- ============================================================================
-- MANDELA — 021 PAYROLL FIX: payslip INSERT policy + cents normalization
-- Two fixes from the live verification of Payroll ⑦:
--
-- 1. 020 created read policies for payslip but no write policy, so the
--    compute step (INSERT payslip per active contract) was refused by RLS
--    for everyone. The bursar/admin prepare; payslip rows exist only
--    through a payroll run.
--
-- 2. EVERY money column in this system is cents. 020 seeded the PAYE bands
--    and personal relief in shillings while the statutory engine reads
--    cents — normalize the 2026 seed (idempotent; runs after 020 on fresh
--    tenants, and is a no-op where already fixed).
-- ============================================================================

CREATE POLICY payslip_write ON payslip FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','bursar'));

-- KRA PAYE bands, annualized, in CENTS:
--   288,000   → 28,800,000  (10%)
--   388,000   → 38,800,000  (25%)
--   6,000,000 → 600,000,000 (30%)
--   9,600,000 → 960,000,000 (32%)
--   above                   (35%)
UPDATE statutory_rates
SET params = '{"bands":[{"up_to":28800000,"rate":0.10},{"up_to":38800000,"rate":0.25},{"up_to":600000000,"rate":0.30},{"up_to":960000000,"rate":0.32},{"rate":0.35}]}'::jsonb
WHERE kind = 'paye' AND period = '2026'
  AND (params->'bands'->0->>'up_to')::bigint < 100000000;

-- Personal relief: KES 2,400/month = KES 28,800/yr = 2,880,000 cents.
-- (020's value was already correct in cents — this line is a guard, not a
-- conversion; it only fires if a shillings-scale value ever appears.)
UPDATE statutory_rates
SET params = '{"annual_cents":2880000}'::jsonb
WHERE kind = 'relief' AND period = '2026'
  AND (params->>'annual_cents')::bigint > 10000000;
