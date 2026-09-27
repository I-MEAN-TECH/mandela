-- ============================================================================
-- MANDELA - 029 PAYSLIP SELF-READ FIX (docs/MASTER-CHECKLIST.md flank 6)
-- 020's payslip_self_read policy checked app.staff_id, a GUC the session
-- layer never sets (it sets app.user_id). Re-point it so staff can actually
-- read their OWN payslip by phone. Idempotent for fresh provisions too.
-- ============================================================================
DROP POLICY IF EXISTS payslip_self_read ON payslip;
CREATE POLICY payslip_self_read ON payslip FOR SELECT USING (
  current_setting('app.role', true) IN ('teacher','principal','counter','driver','admin','bursar')
  AND staff_id::text = current_setting('app.user_id', true));
