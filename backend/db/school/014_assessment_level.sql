-- ============================================================================
-- MANDELA — 014 ASSESSMENT LEVEL AS DATA
-- assessment.grade is the AL1–AL8 national enum; day-to-day SBA levels
-- (BE/AE/ME/EE) and any other scheme key (8-4-4 letters, IGCSE grades) must
-- be stored as DATA from the class's assessment_scheme (008 architecture).
-- `level` holds the raw scheme key; `grade` stays for computed national
-- levels at report time.
-- ============================================================================

ALTER TABLE assessment ADD COLUMN IF NOT EXISTS level text;
