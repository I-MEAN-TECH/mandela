-- 050 — Driver visibility (§6.6 follow-up).
-- The driver role could not read its own route/points/bus/manifest/trips:
-- 024's read lists predate the role. Read gains driver; writes stay
-- leadership-only (024 bus/route/point/manifest, 032 trips + teacher).

DROP POLICY IF EXISTS route_read ON transport_route;
CREATE POLICY route_read ON transport_route FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver'));

DROP POLICY IF EXISTS tpoint_read ON transport_point;
CREATE POLICY tpoint_read ON transport_point FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver'));

DROP POLICY IF EXISTS bus_read ON transport_bus;
CREATE POLICY bus_read ON transport_bus FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver'));

DROP POLICY IF EXISTS tman_read ON transport_manifest;
CREATE POLICY tman_read ON transport_manifest FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver'));

DROP POLICY IF EXISTS ttrip_read ON transport_trip;
CREATE POLICY ttrip_read ON transport_trip FOR SELECT USING (
  current_setting('app.role', true) IN
    ('admin','principal','teacher','bursar','counter','driver'));
