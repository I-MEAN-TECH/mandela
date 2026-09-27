-- ============================================================================
-- MANDELA — CONTROL-PLANE DATABASE (mandela_control)
-- The Provisioner's own database. One row here = one school database +
-- subdomain + integrations + incentive state. Lives on the VPS beside the
-- per-school databases. Only mandela-provisioner and ops jobs connect here.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE install_tier  AS ENUM ('standard','dedicated');
CREATE TYPE school_state  AS ENUM ('provisioning','active','suspended','migrating','decommissioned');
CREATE TYPE job_state     AS ENUM ('queued','running','succeeded','failed','rolled_back');

-- -------------------------------- SCHOOLS ----------------------------------
CREATE TABLE school (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,          -- 'stmarys' -> stmarys.mandela.school
  name              text NOT NULL,
  county            text,
  tier              install_tier NOT NULL DEFAULT 'standard',
  state             school_state NOT NULL DEFAULT 'provisioning',
  db_name           text UNIQUE NOT NULL,          -- mandela_stmarys
  api_pool          text NOT NULL DEFAULT 'shared',-- 'shared' | dedicated pool id
  caddy_host        text UNIQUE NOT NULL,          -- stmarys.mandela.school
  plan              text NOT NULL DEFAULT 'ubuntu',-- ubuntu|sizwe|longwalk
  learner_cap       int NOT NULL DEFAULT 150,
  loyalty_percent   numeric(5,2) NOT NULL DEFAULT 0,  -- 0..20 ladder
  founded_year      int,                           -- founding-20 flag source
  join_code         text UNIQUE,                   -- school invite code (MANDELA-XXXX, Crockford base32)
  join_code_updated_at timestamptz,
  onboarded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------- CREDENTIAL VAULT -----------------------------
-- AES-256-GCM envelope encryption. Master key from VPS secret file, NEVER in
-- DB or env of the web app. Values here are ciphertext only.
CREATE TABLE school_credential (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN (
                'mpesa_consumer_key','mpesa_consumer_secret','mpesa_passkey',
                'mpesa_shortcode','whatsapp_token','whatsapp_phone_id','wa_template_set')),
  ciphertext  bytea NOT NULL,
  iv          bytea NOT NULL,
  tag         bytea NOT NULL,
  rotated_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, kind)
);

-- --------------------------- PROVISIONING JOBS -----------------------------
-- Every provisioning step is a resumable job. Crash mid-way = re-run safely.
CREATE TABLE provision_job (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN (
                'create_db','run_migrations','issue_tls','register_caddy',
                'vault_credentials','register_powersync','seed_admin','verify')),
  state       job_state NOT NULL DEFAULT 'queued',
  attempt     int NOT NULL DEFAULT 0,
  last_error  text,
  idempotency_key text UNIQUE NOT NULL,        -- school_id+kind+target hash
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------- USAGE METERING ------------------------------
-- Powers dashboards, plan enforcement, and WhatsApp tier pacing per school.
CREATE TABLE usage_daily (
  school_id     uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  day           date NOT NULL,
  active_learners int NOT NULL DEFAULT 0,
  wa_messages   int NOT NULL DEFAULT 0,
  sms_messages  int NOT NULL DEFAULT 0,
  mpesa_txns    int NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, day)
);

-- --------------------------- INCENTIVE ENGINE ------------------------------
CREATE TABLE referral (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id    uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  referred_id    uuid UNIQUE REFERENCES school(id) ON DELETE CASCADE, -- one referrer per school
  code           text NOT NULL,
  credited_at    timestamptz,                  -- set when referred school pays
  months_free    int NOT NULL DEFAULT 3
);

CREATE TABLE badge (
  id          serial PRIMARY KEY,
  code        text UNIQUE NOT NULL,            -- 'full_house','wired_school','clean_books','consent_champion'
  name        text NOT NULL,
  description text NOT NULL
);
INSERT INTO badge (code, name, description) VALUES
  ('full_house','Full House','Attendance marked 95% of school days'),
  ('wired_school','Wired School','80%+ parents active on WhatsApp'),
  ('clean_books','Clean Books','30-day daily reconciliation streak'),
  ('consent_champion','Consent Champion','All optional levies consent-gated')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE school_badge (
  school_id  uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  badge_id   int  NOT NULL REFERENCES badge(id) ON DELETE CASCADE,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, badge_id)
);

CREATE TABLE collection_guarantee (
  school_id       uuid PRIMARY KEY REFERENCES school(id) ON DELETE CASCADE,
  baseline_rate   numeric(5,2) NOT NULL,       -- % captured at onboarding
  current_rate    numeric(5,2),
  terms_elapsed   int NOT NULL DEFAULT 0,
  guarantee_active boolean NOT NULL DEFAULT true,
  payout_granted  boolean NOT NULL DEFAULT false
);

CREATE TABLE money_lessons_unlock (
  school_id   uuid PRIMARY KEY REFERENCES school(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(), -- auto when active_learners >= 100
  swahili_track boolean NOT NULL DEFAULT false    -- +90% WA activation
);

-- -------------------------- BURSARY (1% FOR LONG WALK) ---------------------
CREATE TABLE bursary_allocation (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES school(id) ON DELETE CASCADE,
  year         int NOT NULL,
  learner_id   text NOT NULL,                  -- learner id within school DB
  display_name text NOT NULL,                  -- consent-checked display
  funded_cents bigint NOT NULL,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  UNIQUE (school_id, year)
);

-- ------------------------- DB SERVER FLEET REGISTRY ------------------------
-- Tracks VPS nodes so the provisioner knows where standard schools land and
-- where dedicated installs may be pinned.
CREATE TABLE db_node (
  id            serial PRIMARY KEY,
  host          text UNIQUE NOT NULL,          -- '10.0.0.2' or 'db1.vps'
  max_standard  int NOT NULL DEFAULT 100,
  max_dedicated int NOT NULL DEFAULT 2,
  notes         text
);

-- ------------------------------- TRIGGERS ----------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_school_touch BEFORE UPDATE ON school
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
