-- ============================================================================
-- MANDELA - 032 FLANK CLOSURE (docs/MASTER-CHECKLIST.md flanks #1 #5 #11 #12)
-- The final Phase-3 flank sweep. ASCII-only (WIN1252 client_encoding).
--
--   #12  LAUNDRY CUSTODY: per-boarder kit handover (dorm parent's surface),
--        the garment-tracking half of pocket money & laundry. Money half
--        (wallet) already shipped in 028.
--    #5  SYNC OUTBOX: the write queue behind offline resilience. Money
--        NEVER queues (manual-first law); the outbox is for attendance,
--        marks, notes, patrol-style ops writes. Server is the arbiter.
--   #11  AI DRAFTS: the audit trail for draft-only assists (report-card
--        remarks, plain-language parent messages, anomaly flags). The
--        remark generator itself is deterministic + offline (no provider
--        dependency); this table records every draft a human later uses.
--    #1  HOUSE COMPETITIONS: school_event gains kind 'house-competition'
--        and a house_id FK - competitions ride the calendar, standings
--        stay on house_points. No new engine (flank #1 lean position).
-- ============================================================================

-- ------------------------------------------------------ 12 LAUNDRY CUSTODY
CREATE TABLE IF NOT EXISTS laundry_custody (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  items       text NOT NULL,                        -- '2 trousers, 3 shirts, 1 sweater'
  direction   text NOT NULL CHECK (direction IN ('out','in')),
  bag_ref     text,                                 -- laundry-bag tag if the school numbers bags
  handled_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_laundry_learner ON laundry_custody(learner_id, created_at DESC);

-- --------------------------------------------------------- 5 SYNC OUTBOX
CREATE TABLE IF NOT EXISTS sync_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL,                        -- device-generated op id (idempotency)
  endpoint    text NOT NULL,                        -- '/web/admin/attendance/mark' style
  payload     jsonb NOT NULL,
  state       text NOT NULL DEFAULT 'pending'
              CHECK (state IN ('pending','applied','rejected')),
  applied_by  uuid REFERENCES staff(id),            -- resolved server-side at flush
  reject_note text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz,
  UNIQUE (client_id)                                -- replay-proof: same op flushes once
);
CREATE INDEX IF NOT EXISTS idx_outbox_state ON sync_outbox(state, created_at DESC);

-- ------------------------------------------------------------ 11 AI DRAFTS
CREATE TABLE IF NOT EXISTS ai_draft (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('report-remark','parent-message','anomaly')),
  ref_id      text,                                 -- learner/report/message row the draft is about
  subject     text NOT NULL,                        -- learner name or message subject (display)
  body        text NOT NULL,                        -- the drafted text, verbatim
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- inputs (scores, attendance, triggers)
  used        boolean NOT NULL DEFAULT false,       -- human adopted + edited it
  drafted_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_draft_kind ON ai_draft(kind, created_at DESC);

-- --------------------------------------------- 1 HOUSE COMPETITIONS (events)
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'school_event'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE school_event DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;
ALTER TABLE school_event ADD CONSTRAINT school_event_kind_check
  CHECK (kind IN ('event','exam-window','open-day','holiday','meeting','house-competition'));

ALTER TABLE school_event ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES section(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_house ON school_event(house_id);

-- ---------------------------------------------------------------------- RLS
ALTER TABLE laundry_custody ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS laundry_read ON laundry_custody;
CREATE POLICY laundry_read ON laundry_custody FOR SELECT USING (true);
DROP POLICY IF EXISTS laundry_write ON laundry_custody;
CREATE POLICY laundry_write ON laundry_custody FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));

ALTER TABLE sync_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_read ON sync_outbox;
CREATE POLICY outbox_read ON sync_outbox FOR SELECT USING (
  current_setting('app.user_id', true) = client_id::text
  OR current_setting('app.role', true) IN ('admin','principal'));
DROP POLICY IF EXISTS outbox_write ON sync_outbox;
CREATE POLICY outbox_write ON sync_outbox FOR ALL
  USING (current_setting('app.user_id', true) = client_id::text
         OR current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.user_id', true) = client_id::text
         OR current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE ai_draft ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_draft_read ON ai_draft;
CREATE POLICY ai_draft_read ON ai_draft FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
DROP POLICY IF EXISTS ai_draft_write ON ai_draft;
CREATE POLICY ai_draft_write ON ai_draft FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));

-- school_event house_id inherits the existing event policies (no change).
