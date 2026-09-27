-- ============================================================================
-- MANDELA - 027b SECTION KIT (docs/MASTER-CHECKLIST.md flank 43a)
-- The patron's Kit tab: which stock items belong to my section, how many
-- are on hand, and the low-stock warning. ASCII-only comments (WIN1252).
-- ============================================================================

-- Patron Events tab: a section can own an event.
ALTER TABLE school_event ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES section(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_section ON school_event(section_id);

CREATE TABLE IF NOT EXISTS section_kit (
  section_id uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES stock_item(id) ON DELETE CASCADE,
  qty        int  NOT NULL DEFAULT 0 CHECK (qty >= 0),
  min_qty    int  NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  PRIMARY KEY (section_id, item_id)
);

ALTER TABLE section_kit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS section_kit_read ON section_kit;
CREATE POLICY section_kit_read ON section_kit FOR SELECT USING (true);
DROP POLICY IF EXISTS section_kit_write ON section_kit;
CREATE POLICY section_kit_write ON section_kit FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal','teacher'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));
