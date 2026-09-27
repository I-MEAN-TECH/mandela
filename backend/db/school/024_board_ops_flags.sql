-- ============================================================================
-- MANDELA - 024 BOARD + FACILITIES + HOSTEL + INFIRMARY + TRANSPORT + FLAGS
-- Phase 2 completion (docs/BUILD-PHASES.md). ASCII-only comments (WIN1252).
--
--   36 BOARD & BOM: members, meetings, minute items with owners+due -
--     the board never logs in; the pack is printable.
--   34 FACILITIES: repair reports (the janitor's two-tap) against rooms,
--     with the repair-vs-replace verdict computed from cost vs value.
--   23 HOSTEL: dorms + allocations + exeat passes + nightly roll-call.
--   INFIRMARY: health records + clinic visits (DPA-strict like counselling:
--     duty-holder + principal read; allergy flags to class teacher only via
--     the scoped function).
--   20 TRANSPORT: routes/buses/points/manifests (driver data).
--   Calm-IA fold: nav_json Insights -> Reports + Operations entry;
--   desk capability flags (feature_flag) so schools only see what they use.
-- ============================================================================

-- --------------------------- 36 BOARD & BOM ---------------------------------
CREATE TABLE IF NOT EXISTS board_member (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid REFERENCES staff(id) ON DELETE SET NULL,  -- NULL = external
  full_name  text NOT NULL,
  office     text NOT NULL DEFAULT 'member'
             CHECK (office IN ('chair','treasurer','secretary','member','bom-rep')),
  term_start date,
  term_end   date,                       -- expiry chip on the screen
  phone      text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_meeting (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title     text NOT NULL,
  held_on   date NOT NULL,
  agenda    text,
  minutes   text,                        -- minutes-in-brief
  created_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_minute_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES board_meeting(id) ON DELETE CASCADE,
  decision   text NOT NULL,
  action     text,
  owner      text,
  due_on     date,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_minute_status ON board_minute_item(status, due_on);

ALTER TABLE board_member ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_read ON board_member FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY board_write ON board_member FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE board_meeting ENABLE ROW LEVEL SECURITY;
CREATE POLICY bmeeting_read ON board_meeting FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY bmeeting_write ON board_meeting FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE board_minute_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY bminute_read ON board_minute_item FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal'));
CREATE POLICY bminute_write ON board_minute_item FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- --------------------------- 34 FACILITIES ---------------------------------
-- Rooms are free text + optional class link; assets reuse stock_item where
-- a stock row exists, but a repair report can be filed for anything.
CREATE TABLE IF NOT EXISTS repair_report (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room         text NOT NULL,            -- 'G7B classroom', 'Dorm A', 'Lab'
  item         text NOT NULL,            -- 'desks', 'lockers', 'window'
  qty          int NOT NULL DEFAULT 1 CHECK (qty > 0),
  condition    text NOT NULL DEFAULT 'broken' CHECK (condition IN ('worn','broken','structural')),
  note         text,
  photo_key    text,
  reported_by  uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  est_cost_cents bigint NOT NULL DEFAULT 0 CHECK (est_cost_cents >= 0),
  replace_value_cents bigint NOT NULL DEFAULT 0 CHECK (replace_value_cents >= 0),
  state        text NOT NULL DEFAULT 'open' CHECK (state IN ('open','in-repair','done','out-of-service')),
  verdict      text,                     -- computed on write: repair | replace
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_state ON repair_report(state, created_at DESC);

ALTER TABLE repair_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY repair_read ON repair_report FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY repair_any_insert ON repair_report FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY repair_leader_upd ON repair_report FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

-- ------------------------------ 23 HOSTEL ----------------------------------
CREATE TABLE IF NOT EXISTS dorm (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL UNIQUE,        -- 'Dorm A (Girls)'
  kind      text NOT NULL DEFAULT 'mixed' CHECK (kind IN ('boys','girls','mixed')),
  capacity  int NOT NULL DEFAULT 0,
  dorm_parent uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dorm_allocation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dorm_id    uuid NOT NULL REFERENCES dorm(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  bed_label  text,                        -- 'A-12'
  active     boolean NOT NULL DEFAULT true,
  UNIQUE (dorm_id, learner_id)
);

CREATE TABLE IF NOT EXISTS exeat_pass (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  reason     text NOT NULL,
  requested_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  guardian_consent boolean NOT NULL DEFAULT false,   -- OTP path lands with auth
  approved_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  state      text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','approved','out','returned','denied')),
  out_at     timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hostel_rollcall (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dorm_id    uuid NOT NULL REFERENCES dorm(id) ON DELETE CASCADE,
  night      date NOT NULL DEFAULT CURRENT_DATE,
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  present    boolean NOT NULL DEFAULT true,
  recorded_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  UNIQUE (dorm_id, night, learner_id)
);

ALTER TABLE dorm ENABLE ROW LEVEL SECURITY;
CREATE POLICY dorm_read ON dorm FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY dorm_write ON dorm FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE dorm_allocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY dalloc_read ON dorm_allocation FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY dalloc_write ON dorm_allocation FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE exeat_pass ENABLE ROW LEVEL SECURITY;
CREATE POLICY exeat_read ON exeat_pass FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY exeat_request ON exeat_pass FOR INSERT WITH CHECK (
  current_setting('app.role', true) IN ('admin','principal','teacher'));
CREATE POLICY exeat_approve ON exeat_pass FOR UPDATE USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE hostel_rollcall ENABLE ROW LEVEL SECURITY;
CREATE POLICY rollcall_read ON hostel_rollcall FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY rollcall_write ON hostel_rollcall FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal','teacher'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));

-- ------------------------------ INFIRMARY ----------------------------------
-- DPA-strict: same posture as counselling. Duty-holder (nurse hat:
-- 'infirmary') + principal read; the admin sees counts only.
CREATE TABLE IF NOT EXISTS health_record (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('allergy','chronic','immunization','note')),
  detail      text NOT NULL,
  parent_declared boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, kind, detail)
);

CREATE TABLE IF NOT EXISTS clinic_visit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  visited_on  date NOT NULL DEFAULT CURRENT_DATE,
  complaint   text NOT NULL,
  action      text,                       -- SOAP-lite: what was done
  outcome     text,
  parent_notified boolean NOT NULL DEFAULT false,
  medication  text,                       -- charted-as-given
  kit_item_id uuid REFERENCES stock_item(id) ON DELETE SET NULL,  -- auto-deduct
  recorded_by uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE health_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_read ON health_record FOR SELECT USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));
CREATE POLICY health_write ON health_record FOR ALL USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)))
WITH CHECK (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));

ALTER TABLE clinic_visit ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_read ON clinic_visit FOR SELECT USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));
CREATE POLICY clinic_write ON clinic_visit FOR ALL USING (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)))
WITH CHECK (
  current_setting('app.role', true) = 'principal'
  OR EXISTS (SELECT 1 FROM staff_duty d
             WHERE d.staff_id = current_setting('app.user_id', true)::uuid
               AND d.duty_key = 'infirmary'
               AND (d.effective_to IS NULL OR d.effective_to >= CURRENT_DATE)));

CREATE OR REPLACE FUNCTION infirmary_stats()
RETURNS TABLE (records_ct bigint, visits_30d bigint, open_allergies bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM health_record)::bigint,
         (SELECT count(*) FROM clinic_visit WHERE visited_on >= CURRENT_DATE - 30)::bigint,
         (SELECT count(*) FROM health_record WHERE kind = 'allergy')::bigint;
$$;

-- ------------------------------ 20 TRANSPORT -------------------------------
CREATE TABLE IF NOT EXISTS transport_route (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,        -- 'Kilimani AM'
  fee_term_cents bigint NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS transport_bus (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no     text NOT NULL UNIQUE,
  capacity   int NOT NULL DEFAULT 0,
  route_id   uuid REFERENCES transport_route(id) ON DELETE SET NULL,
  driver_staff uuid REFERENCES staff(id) ON DELETE SET NULL,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS transport_point (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   uuid NOT NULL REFERENCES transport_route(id) ON DELETE CASCADE,
  name       text NOT NULL,               -- 'Gitanga Road stop'
  pickup_at  text,                        -- '06:40'
  sort       int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transport_manifest (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   uuid NOT NULL REFERENCES transport_route(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learner(id) ON DELETE CASCADE,
  point_id   uuid REFERENCES transport_point(id) ON DELETE SET NULL,
  term_active boolean NOT NULL DEFAULT true,
  UNIQUE (route_id, learner_id)
);

CREATE TABLE IF NOT EXISTS transport_trip (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id    uuid NOT NULL REFERENCES transport_bus(id) ON DELETE CASCADE,
  route_id  uuid NOT NULL REFERENCES transport_route(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('am','pm')),
  ran_on    date NOT NULL DEFAULT CURRENT_DATE,
  done      boolean NOT NULL DEFAULT false,
  notes     text,
  UNIQUE (bus_id, route_id, direction, ran_on)
);

ALTER TABLE transport_route ENABLE ROW LEVEL SECURITY;
CREATE POLICY route_read ON transport_route FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY route_write ON transport_route FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE transport_bus ENABLE ROW LEVEL SECURITY;
CREATE POLICY bus_read ON transport_bus FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY bus_write ON transport_bus FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE transport_point ENABLE ROW LEVEL SECURITY;
CREATE POLICY tpoint_read ON transport_point FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY tpoint_write ON transport_point FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE transport_manifest ENABLE ROW LEVEL SECURITY;
CREATE POLICY tman_read ON transport_manifest FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY tman_write ON transport_manifest FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal'));

ALTER TABLE transport_trip ENABLE ROW LEVEL SECURITY;
CREATE POLICY ttrip_read ON transport_trip FOR SELECT USING (
  current_setting('app.role', true) IN ('admin','principal','teacher','bursar','counter'));
CREATE POLICY ttrip_write ON transport_trip FOR ALL USING (
  current_setting('app.role', true) IN ('admin','principal','teacher'))
WITH CHECK (current_setting('app.role', true) IN ('admin','principal','teacher'));

-- ------------------- Calm-IA fold + capability flags -----------------------
-- Insights -> Reports (owner decision 2026-09-12) for EVERY role array,
-- idempotent (second run is a no-op because nothing matches).
UPDATE school_settings
SET nav_json = COALESCE((
  SELECT jsonb_object_agg(
    e.key,
    CASE WHEN jsonb_typeof(e.value) = 'array'
      THEN (SELECT jsonb_agg(
              CASE WHEN v = '"Insights"'::jsonb THEN '"Reports"'::jsonb ELSE v END
              ORDER BY ord)
            FROM jsonb_array_elements(e.value) WITH ORDINALITY a(v, ord))
      ELSE e.value END
    ORDER BY e.key)
  FROM jsonb_each(nav_json) e), nav_json)
WHERE id = 'default';

-- Insert Operations before Settings for admin/principal if missing.
UPDATE school_settings s
SET nav_json = jsonb_set(s.nav_json, ARRAY[r.key], (
  SELECT jsonb_agg(x ORDER BY ord)
  FROM (
    SELECT v AS x, ord * 2 AS ord
    FROM jsonb_array_elements(s.nav_json->r.key) WITH ORDINALITY e(v, ord)
    WHERE v <> '"Operations"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, (ord - 1) * 2
    FROM jsonb_array_elements(s.nav_json->r.key) WITH ORDINALITY e(v, ord)
    WHERE v = '"Settings"'::jsonb
    UNION ALL
    SELECT '"Operations"'::jsonb, 1000
    WHERE NOT (s.nav_json->r.key) @> '"Operations"'::jsonb
  ) innerq))
FROM (VALUES ('admin'), ('principal')) AS r(key)
WHERE s.id = 'default'
  AND jsonb_typeof(s.nav_json->r.key) = 'array'
  AND NOT (s.nav_json->r.key) @> '"Operations"'::jsonb;

-- Desk capability flags: a school without buses never sees Transport.
CREATE TABLE IF NOT EXISTS feature_flag (
  key       text PRIMARY KEY,
  label     text NOT NULL,
  enabled   boolean NOT NULL DEFAULT false,
  group_key text NOT NULL DEFAULT 'operations'
             CHECK (group_key IN ('operations','money','academics','platform')),
  updated_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO feature_flag (key, label, enabled, group_key) VALUES
  ('transport', 'Transport (buses & routes)', false, 'operations'),
  ('library',   'Library',                   false, 'operations'),
  ('store',     'Store & kit',               false, 'operations'),
  ('hostel',    'Hostel / boarding',         false, 'operations'),
  ('infirmary', 'Infirmary',                 false, 'operations'),
  ('mess',      'Mess / canteen',            false, 'operations'),
  ('payroll',   'Payroll',                   true,  'money')
ON CONFLICT (key) DO NOTHING;
