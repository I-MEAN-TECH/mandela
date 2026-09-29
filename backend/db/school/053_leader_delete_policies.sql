-- 053: leaders (admin OR principal) may delete sections, transport routes and buses.
-- 023 gave section DELETE to admin only; the principal is a leader too and the
-- app-level check already requires leadership — align the database floor.
-- Transport tables (024) use permissive leader-write policies; their delete
-- coverage is verified below.

-- ---- section: DELETE for admin OR principal ----
DROP POLICY IF EXISTS section_leader_del ON section;
CREATE POLICY section_leader_del ON section
  FOR DELETE
  USING (
    current_setting('app.role', true) IN ('admin', 'principal')
    OR (
      current_setting('app.role', true) = 'staff'
      AND head_staff_id::text = current_setting('app.staff_id', true)
    )
  );

-- ---- transport: ensure DELETE policies exist for both leader roles ----
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transport_route', 'transport_bus', 'transport_point', 'transport_trip'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_leader_del', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (current_setting(''app.role'', true) IN (''admin'', ''principal''))',
      t || '_leader_del', t
    );
  END LOOP;
END $$;
