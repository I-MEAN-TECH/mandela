-- 035 doc templates: theme form + PDF download --------------------------------
-- The Documents Vault becomes the branded document desk: every doc_template
-- gets a document kind (invoice/memo/report-card/…), a theme override and a
-- signature strip + logo toggle. Issued documents carry the render options
-- they were issued with, so the PDF download prints exactly what the office
-- saw — even if the template or school colors change later.

ALTER TABLE doc_template ADD COLUMN IF NOT EXISTS doc_kind text NOT NULL DEFAULT 'letter'
  CHECK (doc_kind IN ('letter','memo','invoice','receipt','report-card','report','purchase-order','fee-structure','notice','other'));

ALTER TABLE doc_template ADD COLUMN IF NOT EXISTS style_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE document ADD COLUMN IF NOT EXISTS doc_kind text;
ALTER TABLE document ADD COLUMN IF NOT EXISTS style_json jsonb;

-- Backfill document.doc_kind from template codes (idempotent).
UPDATE document SET doc_kind = 'certificate' WHERE template_code = 'transfer-cert' AND doc_kind IS NULL;
UPDATE document SET doc_kind = 'id-card' WHERE template_code = 'id-card' AND doc_kind IS NULL;

-- ---------------------------------------------------------------- THEME TEMPLATES
-- Starter set modeled on the office's own inspo files (Desktop\doc templates):
-- invoices with item tables, term memos, POs with totals, fee structures by
-- section, report cards with grading bands. {{placeholders}} fill at issue
-- time; school identity (name, contacts, logo, colors) is overlaid centrally.
INSERT INTO doc_template (code, name, doc_kind, body_md, style_json)
VALUES
  ('INVOICE', 'Invoice', 'invoice', E'# {{school_name}}\n## INVOICE {{invoice_no}}\n\n| | |\n|---|---|\n| **Billed to** | {{learner_name}} · {{class_name}} |\n| **Admission no** | {{adm_no}} |\n| **Term** | {{term}} |\n| **Date** | {{issue_date}} |\n\n| Item | Amount (KES) |\n|---|---:|\n{{items_md}}| **Total due** | **{{total}}** |\n| Paid to date | {{paid}} |\n| **Balance** | **{{balance}}** |\n\nPay to Paybill {{paybill}} · Account {{account}}.\n\n> This invoice is generated from the school ledger — figures agree with the office copy.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Bursar","signer2Label":"Principal"}'),
  ('RECEIPT', 'Payment Receipt', 'receipt', E'# {{school_name}}\n## OFFICIAL RECEIPT {{receipt_no}}\n\n| | |\n|---|---|\n| **Received from** | {{learner_name}} · {{class_name}} |\n| **Amount** | **KES {{amount}}** |\n| **For** | {{reason}} |\n| **Method** | {{method}} · {{reference}} |\n| **Date** | {{issue_date}} |\n\nReceived with thanks. Any balance outstanding remains due as invoiced.\n\n> Issued from the school ledger. This receipt is your proof of payment.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Bursar","signer2Label":"Receiver"}'),
  ('MEMO', 'Staff Memo', 'memo', E'# MEMORANDUM\n\n| | |\n|---|---|\n| **To** | {{to}} |\n| **From** | {{from}} |\n| **Date** | {{issue_date}} |\n| **Ref** | {{ref}} |\n\n## Subject: {{subject}}\n\n{{body}}\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Issued by","signer2Label":"Approved by"}'),
  ('NOTICE', 'Parents'' Notice', 'notice', E'# {{school_name}}\n## NOTICE TO PARENTS\n\n| | |\n|---|---|\n| **Date** | {{issue_date}} |\n| **To** | Parents / Guardians of {{class_name}} |\n| **Re** | {{subject}} |\n\nDear Parents and Guardians,\n\n{{body}}\n\nThank you for your continued support.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Principal","signer2Label":"Chair, BoM"}'),
  ('PO', 'Purchase Order', 'purchase-order', E'# {{school_name}}\n## PURCHASE ORDER {{po_no}}\n\n| | |\n|---|---|\n| **Supplier** | {{supplier}} |\n| **Date** | {{issue_date}} |\n| **Ref** | {{ref}} |\n\n| Item | Qty | Unit price | Amount |\n|---|---:|---:|---:|\n{{items_md}}\n| | | **Total** | **{{total}}** |\n\nDeliver to: {{deliver_to}}\n\n> Approved for purchase per school procurement policy.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Prepared by","signer2Label":"Approved by"}'),
  ('FEE-STRUCTURE', 'Fee Structure', 'fee-structure', E'# {{school_name}}\n## FEE STRUCTURE · {{term}}\n\n| Class | Term fee (KES) |\n|---|---:|\n{{items_md}}\nAdmission fee (one-off): {{admission_fee}} · Caution fee (one-off): {{caution_fee}}\n\nOther charges (uniform, transport, lunch) are billed separately as they arise.\n\n> Fees are payable on or before the first day of term via Paybill {{paybill}}.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":false,"signer1Label":"Bursar","signer2Label":"Principal"}'),
  ('REPORT-CARD', 'Report Card', 'report-card', E'# {{school_name}}\n## TERM REPORT · {{term}}\n\n| | |\n|---|---|\n| **{{learner_label}}** | {{learner_name}} · {{class_name}} |\n| **Admission no** | {{adm_no}} |\n\n| {{area_label}} | Score | Level |\n|---|---:|---:|\n{{items_md}}\n| **Attendance** | {{attendance}} |\n| **Class teacher''s remark** | {{remark}} |\n\nGrading: {{grading}} · Curriculum: {{curriculum_name}}\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Class teacher","signer2Label":"Head teacher"}'),
  ('TRANSFER-CERT', 'Transfer Certificate', 'letter', E'# {{school_name}}\n## TRANSFER CERTIFICATE\n\nThis is to certify that **{{learner_name}}** (Adm No. {{adm_no}}), last of **{{class_name}}**, has left {{school_name}} on {{issue_date}}.\n\n| | |\n|---|---|\n| **Conduct** | {{conduct}} |\n| **Fees status** | {{fees_status}} |\n\nWe wish them every success in their next school.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Principal","signer2Label":"Secretary, BoM"}'),
  ('ADMISSION-LETTER', 'Admission Letter', 'letter', E'# {{school_name}}\n## ADMISSION LETTER\n\n{{issue_date}}\n\nDear {{guardian_name}},\n\nWe are pleased to offer **{{learner_name}}** a place in **{{class_name}}** commencing {{reporting_date}}. Admission number: **{{adm_no}}**.\n\nFee balance on reporting: {{fees_due}}\n\nPlease present this letter on reporting day.\n\nYours faithfully,\n{{issuer_name}}\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Principal","signer2Label":"Registrar"}'),
  ('ID-CARD', 'Learner ID Card', 'other', E'# {{school_name}}\n## LEARNER IDENTITY CARD\n\n| | |\n|---|---|\n| **Name** | {{learner_name}} |\n| **Admission no** | {{adm_no}} |\n| **Class** | {{class_name}} |\n| **Valid to** | {{valid_to}} |\n\nIf found, please return to the school office.\n\n', '{"accent":"brand","paper":"plain","showLogo":true,"showSignatures":true,"signer1Label":"Principal","signer2Label":"Deputy"}')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- RLS REFRESH
ALTER TABLE doc_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_template_read ON doc_template;
CREATE POLICY doc_template_read ON doc_template FOR SELECT USING (true);
DROP POLICY IF EXISTS doc_template_write ON doc_template;
CREATE POLICY doc_template_write ON doc_template FOR ALL
  USING (current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));
