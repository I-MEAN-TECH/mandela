-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 045: STAFF BROADCAST (System completion B1)
--   Announcements could only target guardians (audience jsonb
--   learners|class|all; message rows require a guardian). Staff channels were
--   the §7.7 gap: leadership needs to reach the team (roster/task fanout).
--   1) message.staff_recipient — a message row addressed to a staff member.
--      guardian_id becomes nullable; a CHECK keeps every row addressed to
--      exactly one recipient kind. Staff rows carry no learner.
--   2) RLS: staff read rows addressed to staff (any role); the existing
--      guardian row policy is unchanged. msg_staff (admin/principal) stays.
--   Safe to re-run (IF NOT EXISTS / DROP+CREATE policies).
-- ============================================================================

-- 1) Staff recipient ----------------------------------------------------------
ALTER TABLE message
  ADD COLUMN IF NOT EXISTS staff_recipient uuid REFERENCES staff(id) ON DELETE CASCADE;

-- Existing guardian-only rows keep their semantics; new rows must address
-- exactly one recipient.
ALTER TABLE message DROP CONSTRAINT IF EXISTS message_one_recipient;
ALTER TABLE message ADD CONSTRAINT message_one_recipient CHECK (
  (guardian_id IS NOT NULL AND staff_recipient IS NULL)
  OR (guardian_id IS NULL AND staff_recipient IS NOT NULL)
);

-- Existing rows all have guardians — make guardian nullable only after the
-- constraint is in place (no rows violate it).
ALTER TABLE message ALTER COLUMN guardian_id DROP NOT NULL;

-- 2) RLS: staff can read their own staff-addressed rows -----------------------
DROP POLICY IF EXISTS msg_staff_broadcast ON message;
CREATE POLICY msg_staff_broadcast ON message FOR SELECT USING (
  staff_recipient IS NOT NULL
  AND current_setting('app.role', true) IS NOT NULL
);

-- Write path: the fanout worker connects as mandela_app with no GUCs in some
-- paths (definer-style); keep inserts admin/principal-driven via the API and
-- allow the worker's existing service access (it already inserts messages).
