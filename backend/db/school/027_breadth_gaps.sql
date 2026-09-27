-- ============================================================================
-- MANDELA - 027 BREADTH GAPS (docs/MASTER-CHECKLIST.md flank batches)
-- Phase 3 depth: exam entries, class moves, mess, security, campaigns,
-- guardianship relationship editor. ASCII-only comments (WIN1252).
--
--   5  EXAM ENTRIES: per-curriculum candidate numbers (KPSEA/KJSEA/KCSE,
--      Cambridge/Edexcel) with exam year, candidate no, status.
--   7  CLASS MOVES with history: the promotion/transfer ledger per learner.
--  26  MESS: weekly menu + per-meal head-count (store-linked note).
--  26b SECURITY: visitor log + gate passes at the counter.
--  30  CAMPAIGNS: bulk opt-in campaigns feeding Talk.
--  12b GUARDIANSHIP: learner_guardian grows a relationship + is_primary
--      (relationship editor; migration-safe ALTERs).
--
-- RLS follows the house role-based pattern (024/025/026). Auditing is done
-- in the API layer (house convention, 90 call sites) - no DB triggers here.
-- ============================================================================

-- ---------------------------------------------------------------- 5 EXAM ENTRIES
CREATE TABLE IF NOT EXISTS exam_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  curriculum    text NOT NULL,                 -- pack code: 'cbc' | '8-4-4' | 'cambridge' | ...
  exam_name     text NOT NULL,                 -- 'KPSEA' | 'KCSE' | 'Checkpoint' ...
  exam_year     int  NOT NULL CHECK (exam_year BETWEEN 2020 AND 2100),
  candidate_no  text,
  status        text NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','registered','entered','withdrawn')),
  registered_by uuid REFERENCES staff(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, exam_name, exam_year)
);
CREATE INDEX IF NOT EXISTS idx_exam_entry_learner ON exam_entry(learner_id);

-- ---------------------------------------------------------------- 7 CLASS MOVES
CREATE TABLE IF NOT EXISTS class_move (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  from_class_id int REFERENCES class(id),
  to_class_id   int REFERENCES class(id),
  kind          text NOT NULL DEFAULT 'promotion'
                CHECK (kind IN ('promotion','transfer','correction')),
  reason        text,
  moved_by      uuid NOT NULL REFERENCES staff(id),
  moved_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_move_learner ON class_move(learner_id, moved_at DESC);

-- ---------------------------------------------------------------- 26 MESS
CREATE TABLE IF NOT EXISTS mess_menu (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,                  -- the Monday
  day        int  NOT NULL CHECK (day BETWEEN 1 AND 7),  -- ISO: 1=Mon
  meal       text NOT NULL CHECK (meal IN ('breakfast','tea','lunch','supper')),
  items      text NOT NULL,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, day, meal)
);

CREATE TABLE IF NOT EXISTS mess_headcount (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_day   date NOT NULL,
  meal       text NOT NULL CHECK (meal IN ('breakfast','tea','lunch','supper')),
  head_count int  NOT NULL CHECK (head_count >= 0),
  note       text,                           -- store-linked note (what stock was drawn)
  taken_by   uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_day, meal)
);

-- ---------------------------------------------------------------- 26b SECURITY
CREATE TABLE IF NOT EXISTS security_visitor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor     text NOT NULL,
  id_no       text,
  phone       text,
  visiting    text NOT NULL,                 -- who/what: 'Grade 7 Blue - Amina' or 'Board meeting'
  purpose     text,
  time_in     timestamptz NOT NULL DEFAULT now(),
  time_out    timestamptz,
  pass_no     text,                          -- printed gate pass reference
  logged_by   uuid NOT NULL REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS idx_security_visitor_in ON security_visitor(time_in DESC);

-- ---------------------------------------------------------------- 30 CAMPAIGNS
CREATE TABLE IF NOT EXISTS opt_in_campaign (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  channel     text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','sms','both')),
  body        text NOT NULL,
  audience    text NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all','boarders','dayscholars','class')),
  class_id    int REFERENCES class(id) ON DELETE SET NULL,
  state       text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','sent')),
  sent_count  int  NOT NULL DEFAULT 0,
  opt_outs    int  NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

-- ---------------------------------------------------------------- 12b GUARDIANSHIP
-- The relationship editor needs a relationship. ALTERs are migration-safe.
ALTER TABLE learner_guardian ADD COLUMN IF NOT EXISTS relationship text NOT NULL DEFAULT 'parent';
ALTER TABLE learner_guardian ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- ============================================================ RLS (house pattern)
ALTER TABLE exam_entry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_entry_read ON exam_entry;
CREATE POLICY exam_entry_read ON exam_entry FOR SELECT USING (true);
DROP POLICY IF EXISTS exam_entry_write ON exam_entry;
CREATE POLICY exam_entry_write ON exam_entry FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE class_move ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_move_read ON class_move;
CREATE POLICY class_move_read ON class_move FOR SELECT USING (true);
DROP POLICY IF EXISTS class_move_write ON class_move;
CREATE POLICY class_move_write ON class_move FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- Mess + security: working surfaces for mess staff / security / counter too.
ALTER TABLE mess_menu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mess_all ON mess_menu;
CREATE POLICY mess_all ON mess_menu FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE mess_headcount ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mess_hc_all ON mess_headcount;
CREATE POLICY mess_hc_all ON mess_headcount FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE security_visitor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_all ON security_visitor;
CREATE POLICY security_all ON security_visitor FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE opt_in_campaign ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_read ON opt_in_campaign;
CREATE POLICY campaign_read ON opt_in_campaign FOR SELECT USING (true);
DROP POLICY IF EXISTS campaign_write ON opt_in_campaign;
CREATE POLICY campaign_write ON opt_in_campaign FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
