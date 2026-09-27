-- ============================================================================
-- MANDELA - 023 SECTIONS + WELFARE + CALENDAR
-- Phase 2 batch (docs/BUILD-PHASES.md). ASCII-only comments (WIN1252).
--
--   38 SECTIONS & PATRONS: one generic engine, sections as rows. The
--     principal appoints a patron (a teacher with a hat, never a new role
--     enum); every section gets the same four capabilities - Kit (existing
--     stock tables, tagged), Money (levies, later), Events (24), Register
--     (members + session roll-call).
--   39/40 DISCIPLINE & COUNSELLING: incidents with an access ladder;
--     counselling cases are DPA-strict - duty-holder + principal read
--     contents, the admin sees a COUNT via a SECURITY DEFINER function,
--     never the table.
--   24 EVENTS & CALENDAR: term calendar items feeding guardian
--     announcements. One audited form.
-- ============================================================================

-- ------------------------------ 38 SECTIONS --------------------------------
CREATE TYPE section_kind AS ENUM (
  'lab','sports','drama','music','club','mess','security',
  'infirmary','library','store','transport','house'
);

CREATE TABLE IF NOT EXISTS section (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,          -- 'Science Lab', 'U16 Football'
  kind          section_kind NOT NULL,
  head_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,  -- the patron
  enabled       boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_section_touch BEFORE UPDATE ON section
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Members: learners in the section (a learner may wear many hats too).
CREATE TABLE IF NOT EXISTS section_member (
  section_id uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  joined_on  date NOT NULL DEFAULT CURRENT_DATE,
  active     boolean NOT NULL DEFAULT true,     -- retire, never delete
  PRIMARY KEY (section_id, learner_id)
);

-- Register capability: a held session + its roll-call marks.
CREATE TABLE IF NOT EXISTS section_session (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  held_on    date NOT NULL DEFAULT CURRENT_DATE,
  held_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  topic      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_section_session ON section_session(section_id, held_on DESC);

CREATE TABLE IF NOT EXISTS section_session_mark (
  session_id uuid NOT NULL REFERENCES section_session(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  present    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (session_id, learner_id)
);

-- Kit capability reuses the stock tables: tag items to the section.
ALTER TABLE stock_item ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES section(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_section ON stock_item(section_id) WHERE section_id IS NOT NULL;

-- RLS. Staff read all sections; admin/principal manage them; the patron
-- writes members/sessions/marks ONLY where they hold the head hat.
ALTER TABLE section ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_staff_read ON section FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY section_leader_ins ON section FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY section_leader_upd ON section FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY section_leader_del ON section FOR DELETE USING (
  current_setting('app.role', true) = 'admin');

ALTER TABLE section_member ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_member_read ON section_member FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY section_member_write ON section_member FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section s
             WHERE s.id = section_member.section_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid))
WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section s
             WHERE s.id = section_member.section_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid));

ALTER TABLE section_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_session_read ON section_session FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY section_session_write ON section_session FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section s
             WHERE s.id = section_session.section_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid))
WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section s
             WHERE s.id = section_session.section_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid));

ALTER TABLE section_session_mark ENABLE ROW LEVEL SECURITY;
CREATE POLICY section_mark_read ON section_session_mark FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY section_mark_write ON section_session_mark FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section_session ss
             JOIN section s ON s.id = ss.section_id
             WHERE ss.id = section_session_mark.session_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid))
WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal')
  OR EXISTS (SELECT 1 FROM section_session ss
             JOIN section s ON s.id = ss.section_id
             WHERE ss.id = section_session_mark.session_id
               AND s.head_staff_id = current_setting('app.user_id', true)::uuid));

-- ---------------------- 39 DISCIPLINE & 40 COUNSELLING ---------------------
CREATE TYPE incident_kind AS ENUM ('merit','demerit');

CREATE TABLE IF NOT EXISTS discipline_incident (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id         uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  class_id           int REFERENCES class(id) ON DELETE SET NULL,
  kind               incident_kind NOT NULL,
  category           text NOT NULL,        -- punctuality, uniform, bullying, academic-excellence...
  points             int NOT NULL DEFAULT 1 CHECK (points > 0),
  description        text NOT NULL,
  action             text,                 -- consequence / award given
  parent_notified_at timestamptz,
  recorded_by        uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  occurred_on        date NOT NULL DEFAULT CURRENT_DATE,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disc_learner ON discipline_incident(learner_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_disc_time    ON discipline_incident(occurred_on DESC);

-- Access ladder lives in the API (class teacher own class, discipline
-- master all, deputy oversight); the DB floor: staff read, staff write,
-- parents read their own child's record only.
ALTER TABLE discipline_incident ENABLE ROW LEVEL SECURITY;
CREATE POLICY disc_staff_read ON discipline_incident FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter')
  OR EXISTS (SELECT 1 FROM learner_guardian lg
             WHERE lg.learner_id = discipline_incident.learner_id
               AND lg.guardian_id = current_setting('app.guardian_id', true)::uuid));
CREATE POLICY disc_staff_write ON discipline_incident FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher'));
CREATE POLICY disc_staff_upd ON discipline_incident FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','teacher'));

-- Counselling: DPA-strict. NO SELECT policy grants contents to the admin.
-- The admin count card reads the SECURITY DEFINER function below, which
-- deliberately exposes counts only.
CREATE TABLE IF NOT EXISTS counselling_case (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  opened_on  date NOT NULL DEFAULT CURRENT_DATE,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','referred','closed')),
  summary    text NOT NULL,
  notes      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{on, note, by}]
  referral   text,
  opened_by  uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_case_touch BEFORE UPDATE ON counselling_case
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE counselling_case ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_counsellor_read ON counselling_case FOR SELECT USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'counselling'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));
CREATE POLICY case_counsellor_write ON counselling_case FOR ALL USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'counselling'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)))
WITH CHECK (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'counselling'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));

CREATE OR REPLACE FUNCTION counselling_stats()
RETURNS TABLE (open_ct bigint, referred_ct bigint, closed_ct bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FILTER (WHERE status = 'open')::bigint,
         count(*) FILTER (WHERE status = 'referred')::bigint,
         count(*) FILTER (WHERE status = 'closed')::bigint
  FROM counselling_case;
$$;

-- ------------------------------ 24 EVENTS ----------------------------------
CREATE TABLE IF NOT EXISTS school_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  kind       text NOT NULL DEFAULT 'event'
             CHECK (kind IN ('event','exam-window','open-day','holiday','meeting')),
  starts_on  date NOT NULL,
  ends_on    date,                     -- multi-day windows
  audience   jsonb NOT NULL DEFAULT '{"all":true}'::jsonb,
  notes      text,
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_date ON school_event(starts_on);

ALTER TABLE school_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_staff_read ON school_event FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter')
  OR current_setting('app.guardian_id', true) IS NOT NULL);
CREATE POLICY event_staff_write ON school_event FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher'));
CREATE POLICY event_staff_upd ON school_event FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY event_staff_del ON school_event FOR DELETE USING (
  current_setting('app.role', true) = 'admin');
