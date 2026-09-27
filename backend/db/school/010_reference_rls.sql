-- ============================================================================
-- MANDELA — 010 REFERENCE RLS (curriculum packs)
-- Reference data: every authenticated session reads (staff AND guardians —
-- parents may see a class's learning areas on homework); nobody writes
-- through the app. Packs evolve via NEW numbered migrations, never via API.
-- ============================================================================

ALTER TABLE curriculum        ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_level  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_area     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scheme ENABLE ROW LEVEL SECURITY;

CREATE POLICY ref_read ON curriculum        FOR SELECT USING (true);
CREATE POLICY ref_read ON curriculum_level  FOR SELECT USING (true);
CREATE POLICY ref_read ON learning_area     FOR SELECT USING (true);
CREATE POLICY ref_read ON assessment_scheme FOR SELECT USING (true);
