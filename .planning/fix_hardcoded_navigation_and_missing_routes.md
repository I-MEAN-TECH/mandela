# Fix Hardcoded Navigation & Missing Role Routes

## Goal
Eliminate all hardcoded navigation dead-ends, fix routing traps, populate missing role pages (e.g., `/app/laundry`), and ensure all 12 roles have full, dynamic sub-navigation and error-free route resolution.

## Planned Changes

1. **Create Missing Route Pages**:
   - Create `frontend/apps/web/src/app/app/laundry/page.tsx` for Dorm Parent laundry custody tracking.

2. **Refactor `tabToHref` in `frontend/apps/web/src/app/app/AppShell.tsx`**:
   - Remove `if (tab === first) return "/app";` trap that breaks navigation if another module tab is listed first in DB `nav_json`.
   - Only map `"Today"` and `"Home"` to `"/app"`.
   - Ensure comprehensive, accurate mappings for all role tabs (`Laundry`, `Hostel`, `Facilities`, `Visitors`, `Inquiries`, `Transport`, `Library`, `Sections`, `Houses`, `Events`, `Exams`, `Directory`, `Collect`, `Reconcile`, `Levies`, `Reports`, `Mark`, `Homework`, `Messages`, `Class`, `Approve`, `Broadcast`, `Care`, `Spend`, `People`, `Academics`, `Operations`, `Insights`, `Settings`).

3. **Expand `NAV_CHILDREN` & `CHILD_ICONS` in `frontend/apps/web/src/app/app/navModules.tsx`**:
   - Define sub-navigation items and icons for non-admin top-level tabs (e.g. `Collect`, `Reconcile`, `Hostel`, `Facilities`, `Library`, `Transport`, `Visitors`, `Inquiries`, `Sections`, `Exams`, `Directory`, `Mark`, `Homework`).
   - Allow non-admin users to access deep sub-module actions directly from their sidebar and `SubChips` menu.

4. **Verify Dynamic Nav Resolution in `backend/apps/api/src/web/queries.ts`**:
   - Confirm `DEFAULT_NAV` and `perm_matrix` merged grants flow cleanly into `bootstrap.nav` without hardcoded truncation or invalid entries.

5. **Typecheck & Gate Verification**:
   - Run `pnpm --filter @mandela/web typecheck`
   - Run `pnpm --filter @mandela/api typecheck`
   - Verify browser navigation across roles.
