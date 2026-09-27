-- ============================================================================
-- MANDELA — 008 CLASSROOM CURRICULUM (any school, any curriculum)
-- docs/CURRICULUM-ARCHITECTURE.md: curriculum as configuration, not code.
-- Kenya reality: CBE and 8-4-4 overlap year by year (KCSE tail + Grade 10
-- pioneers), and private schools run CBE + Cambridge hybrids. Curriculum
-- is therefore DATA, attached per class, never a global constant.
--
-- Shape:
--   curriculum        the system a school follows ('cbe','844','british',...)
--   curriculum_level  the ladder (PP1..G12 / Form1..4 / Year1..13), ordered
--   learning_area     subjects; CBC strands/sub-strands nest via parent_id
--   assessment_scheme grading scales as JSONB data — the report card is a
--                     RENDERER over this, never a hardcoded formula
-- ============================================================================

CREATE TABLE curriculum (
  id   serial PRIMARY KEY,
  code text NOT NULL UNIQUE,     -- 'cbe','844','british','american','ib','ace'
  name text NOT NULL             -- 'CBE (CBC) — Kenya'
);

CREATE TABLE curriculum_level (
  id            serial PRIMARY KEY,
  curriculum_id int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  seq           int  NOT NULL,   -- position on the ladder (1 = entry level)
  code          text NOT NULL,   -- 'PP1','G7','G10','FORM2','Y8'
  label         text NOT NULL,   -- 'Grade 7','Form 2','Year 8'
  UNIQUE (curriculum_id, code)
);

CREATE TABLE learning_area (
  id            serial PRIMARY KEY,
  curriculum_id int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  level_id      int NOT NULL REFERENCES curriculum_level(id) ON DELETE CASCADE,
  code          text NOT NULL,   -- 'ENG','MAT','INT-SCI'
  name          text NOT NULL,   -- 'English','Mathematics','Integrated Science'
  pathway       text CHECK (pathway IN ('stem','social','arts-sports')),  -- Senior School
  parent_id     int REFERENCES learning_area(id) ON DELETE CASCADE,      -- strand -> sub-strand
  UNIQUE (curriculum_id, level_id, code)
);

CREATE TABLE assessment_scheme (
  id            serial PRIMARY KEY,
  curriculum_id int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  code          text NOT NULL UNIQUE,  -- 'cbc-sba','cbe-al','844-marks','igcse-9-1'
  name          text NOT NULL,
  scale         jsonb NOT NULL   -- ordered levels: [{"k":"BE"},{"k":"AE"},...] or [{"k":"A","min":80},...]
);

-- Class is the meeting point: a class sits on ONE ladder position.
ALTER TABLE class ADD COLUMN IF NOT EXISTS level_id int REFERENCES curriculum_level(id);

-- Assessment rows carry their scheme + learning area (area_id nests strands).
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS scheme_id int REFERENCES assessment_scheme(id);
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS area_id   int REFERENCES learning_area(id);

CREATE INDEX idx_level_curriculum ON curriculum_level(curriculum_id);
CREATE INDEX idx_area_level       ON learning_area(level_id);
CREATE INDEX idx_area_parent      ON learning_area(parent_id);
