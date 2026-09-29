-- ============================================================================
-- MANDELA — 056 ASSET ARCHIVE (school asset & accession register)
-- One register for everything the school owns units of, across departments:
--   library   — books (accession register): barcode per copy, source, price
--   lab       — laboratory equipment & consumables (all labs)
--   dorm      — beds, mattresses, lockers
--   class     — desks, chairs (classrooms)
--   office    — desks, chairs, cabinets (staff offices)
--   other     — anything else worth a unit count
-- Modelled on the librarian's accession register + the school fixed-asset
-- register: date, unique number/barcode, name, author/publisher (books),
-- source (bought/gift), price, condition, location, notes. New acquisitions
-- are recorded here at the point of receipt — never batched.
-- Idempotent; new departments/locations are free-text so nothing is boxed in.
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_archive (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department   text NOT NULL CHECK (department IN ('library','lab','dorm','class','office','other')),
  barcode      text UNIQUE NOT NULL,          -- scan target; unique per unit
  name         text NOT NULL,                 -- 'Kiswahili fasuli ya darasa', 'Microscope'
  author       text,                          -- books: author/publisher
  isbn         text,                          -- books: ISBN
  category     text,                          -- free tag: 'Fiction', 'Glassware', 'Desks'
  source       text NOT NULL DEFAULT 'bought' CHECK (source IN ('bought','donated','government','bequest')),
  source_ref   text,                          -- vendor / donor name / LPO no.
  price_cents  bigint NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  received_on  date NOT NULL DEFAULT CURRENT_DATE,   -- date of purchase/receipt
  condition    text NOT NULL DEFAULT 'good' CHECK (condition IN ('good','worn','broken','lost')),
  location     text,                          -- 'Library rack B3', 'Chem lab cabinet 2', 'Dorm A'
  qty          int NOT NULL DEFAULT 1 CHECK (qty > 0),
  note         text,
  recorded_by  uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_archive_dept ON asset_archive(department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_archive_barcode ON asset_archive(barcode);

ALTER TABLE asset_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_read ON asset_archive FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY asset_insert ON asset_archive FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY asset_update ON asset_archive FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY asset_delete ON asset_archive FOR DELETE USING (
  current_setting('app.role', true) IN ('admin','principal'));
