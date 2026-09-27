-- ============================================================================
-- MANDELA - 017 ADMISSIONS FUNNEL + CURRICULUM SETUP CONTROLS
-- Phase 1 (docs/BUILD-PHASES.md): module 3 Admissions and module 16
-- Curriculum Setup. ASCII-only comments (Windows WIN1252 console encoding).
--
-- 3 ADMISSIONS: the front desk walks a family from first phone call to a
-- registered learner. One table, six stages, one audited conversion that
-- mints the admission number and auto-links siblings by phone.
--
-- 16 CURRICULUM SETUP: packs stay migrations (009), but the school now
-- controls WHICH packs run: enabled + default + vocabulary, per
-- docs/CURRICULUM-ARCHITECTURE.md 4.2 (vocab is pack data; visibility
-- follows context).
-- ============================================================================

-- ------------------------- 3 ADMISSION INQUIRY ------------------------------

CREATE TYPE admission_stage AS ENUM ('inquiry','visit','assessment','offered','enrolled','lost');

CREATE TABLE IF NOT EXISTS admission_inquiry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_first    text NOT NULL,
  child_middle   text,
  child_last     text NOT NULL,
  child_dob      date,
  gender         char(1) CHECK (gender IN ('M','F')),
  parent_name    text NOT NULL,
  phone          text NOT NULL,          -- 2547XXXXXXXX; sibling link key
  email          citext,
  level_interest text,                   -- e.g. 'Grade 7' (free until assigned)
  curriculum_code text,                  -- which pack the family asked about
  source         text NOT NULL DEFAULT 'walk-in',  -- walk-in | phone | referral | event
  stage          admission_stage NOT NULL DEFAULT 'inquiry',
  notes          text,
  next_followup_on date,
  -- set by the conversion (never edited by hand):
  learner_id     uuid REFERENCES learner(id) ON DELETE SET NULL,
  admission_no   text,                   -- ADM-xxx minted at conversion
  converted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiry_stage ON admission_inquiry(stage) WHERE stage <> 'enrolled';
CREATE INDEX IF NOT EXISTS idx_inquiry_phone ON admission_inquiry(phone);

CREATE TRIGGER trg_inquiry_touch BEFORE UPDATE ON admission_inquiry
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: every staff role sees the funnel (front desk needs it most);
-- desk writes = admin/principal/counter; conversion inserts LEARNER rows.
ALTER TABLE admission_inquiry ENABLE ROW LEVEL SECURITY;
CREATE POLICY inquiry_staff_read ON admission_inquiry FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY inquiry_desk_ins ON admission_inquiry FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','counter'));
CREATE POLICY inquiry_desk_upd ON admission_inquiry FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','counter'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','counter'));

-- Conversion writes learners; learner had READ-only policies until now.
CREATE POLICY learner_desk_ins ON learner FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','counter'));
CREATE POLICY learner_admin_upd ON learner FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','counter'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','counter'));

-- ------------------------- 16 CURRICULUM PACK CONTROLS -----------------------

ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS enabled   boolean NOT NULL DEFAULT true;
ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS vocab     jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- Vocabulary per pack (architecture 4.2): every classroom label renders
-- from this - a CBE school sees "Learning Areas - Strands", a British
-- school sees "Subjects - Topics", same component, different words.
UPDATE curriculum SET vocab =
  '{"learner_label":"Learner","level_label":"Grade","area_label":"Learning Area","unit_label":"Strand","subunit_label":"Sub-strand"}'::jsonb
  WHERE code = 'cbe' AND vocab = '{}'::jsonb;
UPDATE curriculum SET vocab =
  '{"learner_label":"Student","level_label":"Form","area_label":"Subject","unit_label":null,"subunit_label":null}'::jsonb
  WHERE code = '844' AND vocab = '{}'::jsonb;
UPDATE curriculum SET vocab =
  '{"learner_label":"Pupil","level_label":"Year","area_label":"Subject","unit_label":"Topic","subunit_label":null}'::jsonb
  WHERE code = 'british' AND vocab = '{}'::jsonb;
UPDATE curriculum SET is_default = true WHERE code = 'cbe';
UPDATE curriculum SET is_default = false WHERE code <> 'cbe' AND is_default = true;

-- Write rights: pack enable/disable + vocabulary curation = admin/principal.
-- (010 gave every session SELECT on the packs; writes stay in the setup room.)
CREATE POLICY curriculum_admin_upd ON curriculum FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- Class attachment (a class sits on ONE ladder position) and admission into
-- a class both need class UPDATE, which no policy granted until now.
CREATE POLICY class_admin_upd ON class FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- ------------------------- NAV: the Academics tab ----------------------------
-- Phase 1 introduces the Academics group for admin/principal (Curriculum
-- Setup is its first child). Splice "Academics" in before "Money" without
-- touching school-customized arrays; skip if already present.
-- (Insert-before via jsonb_agg: each element keeps a doubled ordinal and
-- Academics lands on the slot just before Money; appended at the end if
-- Money is absent. Idempotent - skips when Academics already exists.)
UPDATE school_settings
SET nav_json = jsonb_set(nav_json, '{admin}', (
  SELECT jsonb_agg(x ORDER BY ord)
  FROM (
    SELECT v AS x, ord * 2 AS ord
    FROM jsonb_array_elements(nav_json->'admin') WITH ORDINALITY e(v, ord)
    WHERE v <> '"Academics"'::jsonb
    UNION ALL
    SELECT '"Academics"'::jsonb, (ord - 1) * 2
    FROM jsonb_array_elements(nav_json->'admin') WITH ORDINALITY e(v, ord)
    WHERE v = '"Money"'::jsonb
    UNION ALL
    SELECT '"Academics"'::jsonb, 1000
    WHERE NOT (nav_json->'admin') @> '["Money"]'::jsonb
  ) s
))
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'admin') = 'array'
  AND NOT (nav_json->'admin') @> '["Academics"]'::jsonb;

UPDATE school_settings
SET nav_json = jsonb_set(nav_json, '{principal}', (
  SELECT jsonb_agg(x ORDER BY ord)
  FROM (
    SELECT v AS x, ord * 2 AS ord
    FROM jsonb_array_elements(nav_json->'principal') WITH ORDINALITY e(v, ord)
    WHERE v <> '"Academics"'::jsonb
    UNION ALL
    SELECT '"Academics"'::jsonb, (ord - 1) * 2
    FROM jsonb_array_elements(nav_json->'principal') WITH ORDINALITY e(v, ord)
    WHERE v = '"Money"'::jsonb
    UNION ALL
    SELECT '"Academics"'::jsonb, 1000
    WHERE NOT (nav_json->'principal') @> '["Money"]'::jsonb
  ) s
))
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'principal') = 'array'
  AND NOT (nav_json->'principal') @> '["Academics"]'::jsonb;
