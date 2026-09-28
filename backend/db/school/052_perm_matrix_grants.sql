-- 052 - Permissions matrix: finish phase-6 coverage + make it drive nav.
--   1. Seed the grant rows the matrix editor needs: driver/counter had no rows
--      for most modules (037 predates wave-2), and the five wave-2 roles had
--      no rows for the modules their sidebars link to. Missing row = grey
--      cell the admin cannot click. Every seeded row grants 'sees' (the same
--      floor 044-051 shipped into RLS); 'owns' marks the role's home module.
--   2. dorm_parent loses 'owns' on operations (hostel writes live behind the
--      Today primary action; the module grant is sees-level like the rest).
-- The admin can tighten or loosen every cell from Settings > Users afterwards;
-- nav reads 'sees' at request time, so a change lands on next refresh.

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- driver: Transport + its door modules
  ('operations', 'driver', true),
  ('people',     'driver', false),
  ('insights',   'driver', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- counter: money desk + people funnel + operations calendar
  ('money',      'counter', false),
  ('operations', 'counter', false),
  ('insights',   'counter', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- dorm_parent: Care (conduct/welfare) + Operations (hostel)
  ('operations', 'dorm_parent', false),
  ('insights',   'dorm_parent', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- janitor: Operations (facilities) + Insights (compliance view)
  ('insights', 'janitor', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- librarian: Operations (library) + Academics (catalogue context)
  ('academics', 'librarian', false),
  ('insights',  'librarian', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- patron: Operations (sections/events/houses) + Academics (learners context)
  ('academics', 'patron', false),
  ('insights',  'patron', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

INSERT INTO perm_matrix (module_key, role, owns, sees, landing)
SELECT m.module_key, m.role::user_role, m.owns, true, false
FROM (VALUES
  -- HOD: Academics + People (dept teachers) + Insights (report builder)
  ('insights', 'hod', false)
) AS m(module_key, role, owns)
WHERE NOT EXISTS (SELECT 1 FROM perm_matrix p WHERE p.module_key = m.module_key AND p.role = m.role::user_role);

-- dorm_parent owns=false on operations (was seeded owns=true in 037).
UPDATE perm_matrix SET owns = false WHERE module_key = 'operations' AND role = 'dorm_parent';
