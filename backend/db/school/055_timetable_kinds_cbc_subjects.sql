-- ============================================================================
-- MANDELA — 055 TIMETABLE SLOT KINDS + FULL CBC SUBJECT CATALOG
-- 1. timetable_slot.slot_kind: 'lesson' | 'tea' | 'lunch' | 'games' | 'home'.
--    Non-lesson kinds are day-structure entries (tea break, lunch, games,
--    home time): no teacher required, no clash guard, excluded from the
--    teaching-coverage KPIs. Default 'lesson' keeps every existing row valid.
-- 2. learning_area seeds for EVERY CBC level (PP1–Grade 12, all three Senior
--    School pathways) and the 8-4-4 ladder (Std 1–8, Form 1–4), compiled from
--    KICD curriculum designs and CBC subject guides. Idempotent: ON CONFLICT
--    DO NOTHING everywhere — re-running never duplicates.
-- ============================================================================

-- ------------------------- 1. SLOT KINDS ------------------------------------
ALTER TABLE timetable_slot ADD COLUMN IF NOT EXISTS slot_kind text NOT NULL DEFAULT 'lesson';

-- ------------------------- 2. CBE / CBC SUBJECTS ----------------------------

-- Pre-Primary (PP1, PP2) — KICD pre-primary curriculum designs.
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code IN ('PP1','PP2')
JOIN (VALUES
  ('LANG-A','Language Activities'),
  ('MATH-A','Mathematical Activities'),
  ('ENV-A','Environmental Activities'),
  ('PMC-A','Psychomotor & Creative Activities'),
  ('RE-A','Religious Education Activities'),
  ('PPI','Pastoral Programme of Instruction'),
  ('PRE-BRL','Pre-Braille Activities')
) AS v(code, name) ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- Lower Primary (Grade 1–3).
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code IN ('G1','G2','G3')
JOIN (VALUES
  ('LIT','Literacy Activities'),
  ('BRL-LIT','Braille Literacy Activities'),
  ('ENG','English Language Activities'),
  ('KIS','Kiswahili Language Activities'),
  ('KSL','Kenyan Sign Language'),
  ('MATH','Mathematical Activities'),
  ('ENV','Environmental Activities'),
  ('HYG-NUT','Hygiene & Nutrition Activities'),
  ('RE','Religious Education Activities'),
  ('MOVE','Movement & Creative Activities'),
  ('PPI','Pastoral Programme of Instruction')
) AS v(code, name) ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- Upper Primary (Grade 4–6): core + optional (foreign/indigenous languages, KSL, Braille).
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code IN ('G4','G5','G6')
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('KSL','Kenyan Sign Language'),
  ('MATH','Mathematics'),('SCI-TECH','Science & Technology'),
  ('SST','Social Studies'),('HOME-SCI','Home Science'),('AGRI','Agriculture'),
  ('CRE','Christian Religious Education'),('IRE','Islamic Religious Education'),
  ('HRE','Hindu Religious Education'),('CRE-ARTS','Creative Arts'),
  ('PHE','Physical & Health Education'),
  ('ARABIC','Arabic'),('FR','French'),('GER','German'),('MAND','Mandarin'),
  ('INDIG','Indigenous Language'),('BRL','Braille Literacy')
) AS v(code, name) ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- Junior Secondary (Grade 7–9): core + optional. Extends the 009 G7 seed.
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code IN ('G7','G8','G9')
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('KSL','Kenyan Sign Language'),
  ('MAT','Mathematics'),('INT-SCI','Integrated Science'),
  ('HEALTH','Health Education'),('PRE-TECH','Pre-Technical & Pre-Career Education'),
  ('SST','Social Studies'),('CRE','Christian Religious Education'),
  ('IRE','Islamic Religious Education'),('HRE','Hindu Religious Education'),
  ('BUS','Business Studies'),('AGRI','Agriculture'),
  ('LLL','Life Skills Education'),('SPORTS','Sports & Physical Education'),
  ('VIS-ART','Visual Arts'),('PERF-ART','Performing Arts'),
  ('HOME-SCI','Home Science'),('CAT','Computer Science'),
  ('ARABIC','Arabic'),('FR','French'),('GER','German'),('MAND','Mandarin'),
  ('INDIG','Indigenous Language')
) AS v(code, name) ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- Senior School (Grade 10–12): shared core + the three pathways.
INSERT INTO learning_area (curriculum_id, level_id, code, name, pathway)
SELECT cu.id, lv.id, v.code, v.name, v.pathway
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id AND lv.code IN ('G10','G11','G12')
JOIN (VALUES
  -- shared core
  ('ENG','English','social'),('KIS','Kiswahili','social'),
  ('KSL','Kenyan Sign Language','social'),('MATH','Mathematics','stem'),
  ('ICT','ICT','stem'),('PE','Physical Education','stem'),
  ('CSL','Community Service Learning','stem'),
  -- STEM pathway
  ('PHY','Physics','stem'),('CHEM','Chemistry','stem'),('BIO','Biology','stem'),
  ('CAT','Computer Science','stem'),('AGRI','Agriculture','stem'),
  ('FOODS','Foods & Nutrition','stem'),('HOME-MGT','Home Management','stem'),
  ('WOOD','Wood Technology','stem'),('ELEC','Electrical Technology','stem'),
  ('METAL','Metal Technology','stem'),('AVI','Aviation Technology','stem'),
  ('MECH','Mechatronics','stem'),('MEDIA-T','Media Technology','stem'),
  ('GARMENT','Garment Making & Interior Design','stem'),
  ('WELD','Welding','stem'),('PLUMB','Plumbing','stem'),
  ('MVM','Motor Vehicle Mechanics','stem'),
  ('CARP','Carpentry & Joinery','stem'),('FNBEV','Food & Beverage','stem'),
  -- Social Sciences pathway
  ('HIST','History & Citizenship','social'),('GEO','Geography','social'),
  ('CRE','Christian Religious Education','social'),
  ('IRE','Islamic Religious Education','social'),
  ('HRE','Hindu Religious Education','social'),
  ('BST','Business Studies','social'),
  ('ENG-LIT','Literature in English','social'),
  ('FASIHI','Fasihi ya Kiswahili','social'),
  ('ARABIC','Arabic','social'),('FR','French','social'),
  ('GER','German','social'),('MAND','Mandarin','social'),
  ('INDIG','Indigenous Language','social'),
  -- Arts & Sports Science pathway
  ('PERFORM','Performing Arts (Music, Dance, Theatre)','arts-sports'),
  ('FINE-ART','Fine Art & Crafts','arts-sports'),
  ('MEDIA-ART','Time-Based Media & Applied Art','arts-sports'),
  ('LEGAL-ART','Legal & Ethical Issues in Arts','arts-sports'),
  ('COMM-SK','Communication Skills','arts-sports'),
  ('SP-PHYS','Human Physiology, Anatomy & Nutrition','arts-sports'),
  ('SP-ETH','Sports Ethics','arts-sports'),
  ('ATHL','Athletics & Gymnastics','arts-sports'),
  ('WATER-SP','Water Sports','arts-sports'),
  ('MARTIAL','Martial Arts','arts-sports'),
  ('ADV-PE','Advanced Physical Education','arts-sports')
) AS v(code, name, pathway) ON true
WHERE cu.code = 'cbe'
ON CONFLICT DO NOTHING;

-- ------------------------- 3. 8-4-4 SUBJECTS --------------------------------

-- Primary (Standard 1–8).
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id
  AND lv.code IN ('STD1','STD2','STD3','STD4','STD5','STD6','STD7','STD8')
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('KSL','Kenyan Sign Language'),
  ('MATH','Mathematics'),('SCI','Science'),('SST','Social Studies'),
  ('CRE','CRE'),('IRE','IRE'),('HRE','HRE'),
  ('AGRI','Agriculture'),('PHE','Physical & Health Education'),
  ('ART','Art & Craft'),('MUSIC','Music'),('HOME-SCI','Home Science')
) AS v(code, name) ON true
WHERE cu.code = '844'
ON CONFLICT DO NOTHING;

-- Secondary (Form 1–4).
INSERT INTO learning_area (curriculum_id, level_id, code, name)
SELECT cu.id, lv.id, v.code, v.name
FROM curriculum cu
JOIN curriculum_level lv ON lv.curriculum_id = cu.id
  AND lv.code IN ('FORM1','FORM2','FORM3','FORM4')
JOIN (VALUES
  ('ENG','English'),('KIS','Kiswahili'),('MAT','Mathematics'),
  ('BIO','Biology'),('CHEM','Chemistry'),('PHY','Physics'),
  ('HIST','History & Government'),('GEO','Geography'),
  ('CRE','CRE'),('IRE','IRE'),('HRE','HRE'),
  ('AGR','Agriculture'),('BST','Business Studies'),
  ('COMP','Computer Studies'),('HSCI','Home Science'),
  ('ART','Art & Design'),('MUS','Music'),
  ('FRE','French'),('GER','German'),('ARB','Arabic'),
  ('PHE','Physical Education')
) AS v(code, name) ON true
WHERE cu.code = '844'
ON CONFLICT DO NOTHING;
