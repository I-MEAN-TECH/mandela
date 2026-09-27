-- ============================================================================
-- MANDELA - 019 APPROVALS INBOX (36) + TASKS (37)
-- Phase 2 opening pair (docs/BUILD-PHASES.md). The two-leaders model's
-- hinge (blueprint 253-262): every request needing the owner's sign-off in
-- ONE queue; every follow-up as a task any module can emit.
-- ASCII-only comments (Windows WIN1252 console encoding).
-- ============================================================================

CREATE TYPE approval_state AS ENUM ('pending','approved','rejected');
CREATE TYPE task_state    AS ENUM ('open','done','cancelled');

-- 36 APPROVAL_REQUEST - type, requester, payload JSON, decision, reason.
CREATE TABLE IF NOT EXISTS approval_request (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type  text NOT NULL,          -- 'fee-waiver','purchase','leave','route-add','write-off','other'
  requester_id  uuid NOT NULL REFERENCES staff(id),   -- who asks
  approver_role text NOT NULL DEFAULT 'admin',        -- who must sign (two-leaders model)
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {amount_cents?, about?, note?}
  state         approval_state NOT NULL DEFAULT 'pending',
  decided_by    uuid REFERENCES staff(id),            -- who signed
  decision_reason text NOT NULL DEFAULT '',           -- mandatory on approve/reject
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_state ON approval_request(state, created_at);

CREATE TRIGGER trg_approval_touch BEFORE UPDATE ON approval_request
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 37 ADMIN_TASK - the operating rhythm; any module can emit one.
CREATE TABLE IF NOT EXISTS admin_task (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  detail      text,
  source      text NOT NULL DEFAULT 'manual',  -- 'manual','compliance','kemis','defaulters','term-close','board'
  source_link text,                            -- deep-link, e.g. '/app/insights/compliance'
  assignee_id uuid REFERENCES staff(id),
  due_on      date,
  state       task_state NOT NULL DEFAULT 'open',
  done_by     uuid REFERENCES staff(id),
  done_at     timestamptz,
  created_by  uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_state ON admin_task(state, due_on);

CREATE TRIGGER trg_task_touch BEFORE UPDATE ON admin_task
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: staff read (requesters follow their own requests; the inbox itself is
-- role-gated in the API); writes stay admin/principal (+ requester inserts).
ALTER TABLE approval_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_staff_read ON approval_request FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY approval_staff_ins ON approval_request FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY approval_leader_upd ON approval_request FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE admin_task ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_staff_read ON admin_task FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY task_staff_ins ON admin_task FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY task_leader_upd ON admin_task FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- The operating rhythm, seeded from what the system already knows:
-- the county licence countdown (28) and the KEMIS gaps (05) become tasks.
INSERT INTO admin_task (title, detail, source, source_link, due_on)
SELECT 'Renew the county licence',
       'The licence line in the Compliance Center is open - renewal asks for the same learner/staff data.',
       'compliance', '/app/insights/compliance', '2026-12-31'
WHERE NOT EXISTS (SELECT 1 FROM admin_task WHERE source = 'compliance' AND state = 'open');

INSERT INTO admin_task (title, detail, source, source_link, due_on)
SELECT 'Close the KEMIS data gaps',
       'Some active learners are missing UPI / birth cert / guardian. The fix list lives in Exam Entries.',
       'kemis', '/app/people/exam-entries', NULL
WHERE NOT EXISTS (SELECT 1 FROM admin_task WHERE source = 'kemis' AND state = 'open');
