-- ============================================================================
-- MANDELA — 009 CURRICULUM PACKS (idempotent seed data for migration 008)
-- Kenya ladders + learning areas + assessment schemes, seeded as DATA.
-- Every INSERT is guarded: re-running never duplicates, editing applied
-- migrations is forbidden — packs evolve via NEW numbered migrations.
-- ============================================================================

-- --------------------------- CURRICULA --------------------------------------
INSERT INTO curriculum (code, name) VALUES
  ('cbe',     'CBE (CBC) — Kenya'),
  ('844',     '8-4-4 — Kenya'),
  ('british', 'British National (Cambridge/Edexcel)')
ON CONFLICT (code) DO NOTHING;

-- --------------------------- CBE LADDER -------------------------------------
-- PP1..PP2, Grade 1..9 (Junior School), Grade 10..12 (Senior School).
INSERT INTO curriculum_level (curriculum_id, seq, code, label)
SELECT cu.id, v.seq, v.code, v.label
FROM curriculum cu, (VALUES
  (1,'PP1','Pre-Primary 1'),(2,'PP2','Pre-Primary 2'),
  (3,'G1','Grade 1'),(4,'G2','Grade 2'),(5,'G3','Grade 3'),
  (6,'G4','Grade 4'),(7,'G5','Grade 5'),(8,'G6','Grade 6'),
  (9,'G7','Grade 7'),(10,'G8','Grade 8'),(11,'G9','Grade 9'),
  (12,'G10','Grade 10'),(13,'G11','Grade 11'),(14,'G12','Grade 12')
) AS v(seq, code, label)
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- --------------------------- 8-4-4 LADDER -----------------------------------
INSERT INTO curriculum_level (curriculum_id, seq, code, label)
SELECT cu.id, v.seq, v.code, v.label
FROM curriculum cu, (VALUES
  (1,'STD1','Standard 1'),(2,'STD2','Standard 2'),(3,'STD3','Standard 3'),
  (4,'STD4','Standard 4'),(5,'STD5','Standard 5'),(6,'STD6','Standard 6'),
  (7,'STD7','Standard 7'),(8,'STD8','Standard 8'),
  (9,'FORM1','Form 1'),(10,'FORM2','Form 2'),(11,'FORM3','Form 3'),(12,'FORM4','Form 4')
) AS v(seq, code, label)
WHERE cu.code = '844'
ON CONFLICT DO NOTHING;

-- --------------------------- BRITISH LADDER ---------------------------------
INSERT INTO curriculum_level (curriculum_id, seq, code, label)
SELECT cu.id, v.seq, v.code, v.label
FROM curriculum cu, (VALUES
  (1,'Y1','Year 1'),(2,'Y2','Year 2'),(3,'Y3','Year 3'),(4,'Y4','Year 4'),
  (5,'Y5','Year 5'),(6,'Y6','Year 6'),
  (7,'Y7','Year 7'),(8,'Y8','Year 8'),(9,'Y9','Year 9'),
  (10,'Y10','Year 10'),(11,'Y11','Year 11 (IGCSE)'),
  (12,'Y12','Year 12 (AS)'),(13,'Y13','Year 13 (A-Level)')
) AS v(seq, code, label)
WHERE cu.code = 'british'
ON CONFLICT DO NOTHING;

-- --------------------- CBE JUNIOR SCHOOL LEARNING AREAS (G7–G9) -------------
-- Grade 7 seed; the school can clone/extend per level in Settings later.
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code = 'G7'
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('MAT','Mathematics'),
  ('INT-SCI','Integrated Science'),('PRE-TECH','Pre-Technical Studies'),
  ('SST','Social Studies'),('CRE','Christian Religious Education'),
  ('IRE','Islamic Religious Education'),('HRE','Hindu Religious Education'),
  ('BUS','Business Studies'),('AGRI','Agriculture'),('CAT','Computer Science'),
  ('LLL','Life Skills Education'),('PE','Physical Education'),
  ('VIS-ART','Visual Arts'),('PERF-ART','Performing Arts')
) AS v(code, name)
  ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- --------------------- 8-4-4 SECONDARY SUBJECTS (FORM 3) --------------------
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code = 'FORM3'
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('MAT','Mathematics'),
  ('BIO','Biology'),('CHEM','Chemistry'),('PHY','Physics'),
  ('HIST','History & Government'),('GEO','Geography'),('CRE','CRE'),
  ('AGR','Agriculture'),('BST','Business Studies')
) AS v(code, name)
  ON true
WHERE cu.code = '844'
ON CONFLICT DO NOTHING;

-- --------------------- BRITISH SUBJECTS (Y10) -------------------------------
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code = 'Y10'
JOIN (VALUES
  ('ENG-LANG','English Language'),('ENG-LIT','English Literature'),
  ('MAT','Mathematics'),('BIOL','Biology'),('CHEM','Chemistry'),
  ('PHYS','Physics'),('HIST','History'),('GEOG','Geography'),
  ('BUS-ST','Business Studies'),('CS','Computer Science'),('FR','French')
) AS v(code, name)
  ON true
WHERE cu.code = 'british'
ON CONFLICT DO NOTHING;

-- --------------------------- ASSESSMENT SCHEMES -----------------------------
-- CBE day-to-day SBA: 4 performance levels (KNEC CBA framework).
INSERT INTO assessment_scheme (curriculum_id, code, name, scale)
SELECT cu.id, 'cbc-sba', 'CBE day-to-day (BE / AE / ME / EE)',
  '[{"k":"BE","name":"Below Expectation"},
    {"k":"AE","name":"Approaching Expectation"},
    {"k":"ME","name":"Meeting Expectation"},
    {"k":"EE","name":"Exceeding Expectation"}]'::jsonb
FROM curriculum cu WHERE cu.code = 'cbe'
ON CONFLICT (code) DO NOTHING;

-- CBE national AL1–AL8 scale (KJSEA-style reporting).
INSERT INTO assessment_scheme (curriculum_id, code, name, scale)
SELECT cu.id, 'cbe-al', 'CBE Performance Levels (AL1–AL8)',
  '[{"k":"AL1","name":"Level 1"},{"k":"AL2","name":"Level 2"},
    {"k":"AL3","name":"Level 3"},{"k":"AL4","name":"Level 4"},
    {"k":"AL5","name":"Level 5"},{"k":"AL6","name":"Level 6"},
    {"k":"AL7","name":"Level 7"},{"k":"AL8","name":"Level 8"}]'::jsonb
FROM curriculum cu WHERE cu.code = 'cbe'
ON CONFLICT (code) DO NOTHING;

-- 8-4-4 marks + mean grade.
INSERT INTO assessment_scheme (curriculum_id, code, name, scale)
SELECT cu.id, '844-marks', '8-4-4 Marks & Mean Grade (A–E)',
  '[{"k":"A","min":80},{"k":"A-","min":75},{"k":"B+","min":70},
    {"k":"B","min":65},{"k":"B-","min":60},{"k":"C+","min":55},
    {"k":"C","min":50},{"k":"C-","min":45},{"k":"D+","min":40},
    {"k":"D","min":35},{"k":"D-","min":30},{"k":"E","min":0}]'::jsonb
FROM curriculum cu WHERE cu.code = '844'
ON CONFLICT (code) DO NOTHING;

-- IGCSE 9–1 (Edexcel numeric; Cambridge A*–G variant seeds later on demand).
INSERT INTO assessment_scheme (curriculum_id, code, name, scale)
SELECT cu.id, 'igcse-9-1', 'IGCSE Grades (9–1)',
  '[{"k":"9","name":"9 (Highest)"},{"k":"8"},{"k":"7"},{"k":"6"},
    {"k":"5"},{"k":"4"},{"k":"3"},{"k":"2"},{"k":"1"},{"k":"U","name":"Ungraded"}]'::jsonb
FROM curriculum cu WHERE cu.code = 'british'
ON CONFLICT (code) DO NOTHING;
