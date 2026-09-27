-- ============================================================================
-- MANDELA — 013 ASSESSMENT UPSERT FIX
-- The natural key includes strand/sub_strand, which are NULL for flat
-- (non-CBC-strand) subjects. Postgres treats NULLs as distinct in UNIQUE
-- constraints, so ON CONFLICT upserts could duplicate rows. Postgres 15+
-- NULLS NOT DISTINCT makes the key behave as the app expects: re-recording
-- an assessment UPDATES, never duplicates (same guarantee as attendance).
-- ============================================================================

ALTER TABLE assessment
  DROP CONSTRAINT IF EXISTS assessment_learner_id_term_id_subject_strand_exam_type_key;

ALTER TABLE assessment
  ADD CONSTRAINT assessment_entry_unique UNIQUE NULLS NOT DISTINCT (learner_id, term_id, subject, strand, exam_type);
