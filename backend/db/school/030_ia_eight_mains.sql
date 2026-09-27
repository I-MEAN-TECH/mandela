-- 030_ia_eight_mains.sql - Calm-IA regroup (owner-approved 2026-09-24).
-- Seven uneven mains with 47 children become EIGHT mains with 4-5 each
-- (Money gains a Spend sibling; Care splits out of Operations; Insights
-- becomes the proof/paperwork door). Admin gets the full module map.
-- Principal gains Academics (exam-card approval is their desk). Every
-- other role keeps its task tabs - role screens come from nav_json too
-- and are NOT touched here. Children stay defined in navModules.tsx;
-- this migration only sets the TOP-LEVEL arrays.
--
-- Idempotent: the UPDATE fires only when the current array doesn't
-- already contain 'Spend' (admin) / 'Academics' (principal). Re-runs and
-- re-migrations are no-ops. seed:branding now seeds the same map, so
-- fresh schools and migrated schools agree.
--
-- NB: ASCII only - the embedded Postgres session runs client_encoding
-- WIN1252, so smart quotes and arrows in SQL comments break the run.

-- Admin -> the eight mains (order = sidebar order; Today is home).
UPDATE school_settings
SET nav_json = jsonb_set(
  nav_json,
  '{admin}',
  '["Today","Money","Spend","People","Academics","Operations","Care","Insights","Settings"]'::jsonb
)
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'admin') = 'array'
  AND NOT (nav_json->'admin') @> '"Spend"'::jsonb;

-- Principal -> role desk + Academics oversight (report-card approval).
UPDATE school_settings
SET nav_json = jsonb_set(
  nav_json,
  '{principal}',
  '["Today","Academics","Operations","Approve","Reports","Broadcast","Directory"]'::jsonb
)
WHERE id = 'default'
  AND jsonb_typeof(nav_json->'principal') = 'array'
  AND NOT (nav_json->'principal') @> '"Academics"'::jsonb;
