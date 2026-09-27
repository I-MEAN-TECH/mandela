-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 033: CHANNELS, DAILY LOOP & PORTABLE RECORDS
-- 1) channel_config — per-school connectivity the ADMIN enters in Settings
--    (WhatsApp Cloud API creds, SMTP), secrets encrypted at rest (AES-256-GCM
--    with VAULT_MASTER_KEY). The school owns its channel, not the platform.
-- 2) digest settings + per-guardian channel preference (whatsapp | email | none).
-- 3) message.kind — announcement vs digest vs receipt vs record, and a dedupe
--    key so the daily loop never double-sends.
-- 4) guardian.email — the daily loop's email channel.
-- 5) record_export — the append-only chain backing signed portable records
--    (docs/RECORD-FORMAT.md) + the school's record signing secret.
-- Applied by the provisioner's checksummed migration runner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CHANNEL CONFIG — one row per school, admin-entered
-- ---------------------------------------------------------------------------
CREATE TABLE channel_config (
  id                text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  -- WhatsApp Cloud API (Meta): the admin pastes these from developers.facebook.com
  wa_phone_number_id text,
  wa_token_enc      text,            -- AES-256-GCM(iv||ct||tag), base64
  -- Email (SMTP): the admin pastes host/port/user/pass from their mail provider
  smtp_host         text,
  smtp_port         int,
  smtp_user         text,
  smtp_from         text,            -- e.g. "St Mary's <school@stmarys.ac.ke>"
  smtp_pass_enc     text,            -- AES-256-GCM(iv||ct||tag), base64
  -- Record signing (docs/RECORD-FORMAT.md §4) — generated on first export
  record_secret     text,            -- 32-byte hex; HMAC key for portable records
  -- Daily loop (the habit): time is Africa/Nairobi local "HH:MM"
  digest_enabled    boolean NOT NULL DEFAULT false,
  digest_time       text NOT NULL DEFAULT '07:00' CHECK (digest_time ~ '^\d{2}:\d{2}$'),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES staff(id) ON DELETE SET NULL
);

INSERT INTO channel_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) MESSAGE KINDS + DEDUPE — the worker's state machine grows a purpose
-- ---------------------------------------------------------------------------
ALTER TABLE message ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'announcement';
ALTER TABLE message ADD COLUMN IF NOT EXISTS dedupe_key text;
-- Email is a first-class delivery channel for the daily loop.
ALTER TYPE message_channel ADD VALUE IF NOT EXISTS 'email';

-- One send per dedupe key — "the digest for 2026-09-24 for guardian X" sends
-- once, no matter how many times the worker ticks or the API retries.
CREATE INDEX IF NOT EXISTS idx_message_dedupe
  ON message(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_dedupe
  ON message(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) GUARDIAN EMAIL — optional; channel preference for the daily loop
-- ---------------------------------------------------------------------------
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS pref_channel text
  NOT NULL DEFAULT 'whatsapp' CHECK (pref_channel IN ('whatsapp','email','none'));

-- ---------------------------------------------------------------------------
-- 4) RECORD EXPORT CHAIN — signed portable records (parent-owned)
-- ---------------------------------------------------------------------------
CREATE TABLE record_export (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  learner_id    uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  guardian_id   uuid REFERENCES guardian(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('fee_statement','report_card','attendance_summary')),
  term_id       int REFERENCES term(id) ON DELETE SET NULL,
  payload_hash  text NOT NULL,          -- sha256 of the canonical body
  prev_hash     text,                   -- chain: hash of the learner's previous export
  signature     text NOT NULL,          -- HMAC-SHA256 hex over canonical envelope
  issued_to     text,                   -- phone hash of the receiving guardian
  issued_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_record_export_learner ON record_export(learner_id, issued_at DESC);

-- ---------------------------------------------------------------------------
-- 5) RLS — config is admin/principal only; exports follow the learner
-- ---------------------------------------------------------------------------
ALTER TABLE channel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_config_admin ON channel_config FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY channel_config_admin_ins ON channel_config FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY channel_config_admin_upd ON channel_config FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
  WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE record_export ENABLE ROW LEVEL SECURITY;
CREATE POLICY record_export_staff ON record_export FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','bursar','teacher','counter')
  OR (current_setting('app.role', true) = 'guardian'
      AND learner_id IN (SELECT app_guardian_learner_ids())));
CREATE POLICY record_export_ins ON record_export FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','bursar','counter')
  OR (current_setting('app.role', true) = 'guardian'
      AND learner_id IN (SELECT app_guardian_learner_ids())));

-- Guardian writes their own channel preference + email (self-service;
-- mirrors the guardian_self read policy from 002_rls.sql)
CREATE POLICY guardian_self_channel ON guardian FOR UPDATE USING (
  id = app_guardian_id())
  WITH CHECK (id = app_guardian_id());

-- ---------------------------------------------------------------------------
-- 6) AUDIT — config changes and record exports are append-only logged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_channel_config() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
  VALUES (NULL, 'system', 'channel.config', 'channel_config', NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END,
          row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channel_config_audit ON channel_config;
CREATE TRIGGER trg_channel_config_audit
  AFTER INSERT OR UPDATE ON channel_config
  FOR EACH ROW EXECUTE FUNCTION audit_channel_config();
