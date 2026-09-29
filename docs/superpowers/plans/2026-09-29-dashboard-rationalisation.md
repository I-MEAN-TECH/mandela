# Dashboard Rationalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Mandela role a focused overview with decision KPIs and charts, while removing duplicate module navigation and generic icons.

**Architecture:** A single typed client navigation registry becomes the source for canonical paths, labels, icons, and child modules. Backend role defaults return only canonical workflow tabs. Existing Pulse endpoints are audited against a role overview contract; missing decision data is added through RLS-scoped queries only.

**Tech Stack:** Next.js 15, React 19, TypeScript, Lucide React, `@mandela/ui`, NestJS 11, PostgreSQL RLS, pnpm/Turbo.

## Global Constraints

- Use `@mandela/ui` tokens and chart primitives only; theme does not change.
- No new dependency for icons, charts, dashboard framework, or permissions.
- Preserve every existing authorized route; remove duplicate navigation, not data or access controls.
- Server-side role checks and PostgreSQL RLS remain authoritative.
- All visible navigation entries require an explicit Lucide icon.
- Dashboard charts need role-specific decision value, text labels, and useful empty states.

---

### Task 1: Canonical navigation registry and icon coverage

**Files:**
- Modify: `frontend/apps/web/src/app/app/navModules.tsx`
- Modify: `frontend/apps/web/src/app/app/AppShell.tsx`
- Modify: `frontend/apps/web/src/app/app/SubChips.tsx`
- Create: `frontend/apps/web/src/app/app/navModules.test.ts`

**Interfaces:**
- Produces `NAV_MODULES`, `tabToHref(tab)`, `iconForTab(tab)`, and `childrenForTab(tab)`.
- `AppShell` and `SubChips` consume registry helpers and never render icon fallbacks.

- [ ] Write assertions that every top-level tab and child has an explicit icon and route, and no child route repeats under different parents.
- [ ] Run the test; verify current duplicate routes fail.
- [ ] Replace disconnected icon and route maps with a typed registry that owns canonical route, icon, and child modules.
- [ ] Canonicalize labels and remove duplicate child entries: library under Academics, store under Operations, admissions under People, fees under Finance, examinations under Academics, sections under Operations.
- [ ] Update `AppShell` and `SubChips` to use registry helpers without `LayoutDashboard` fallback.
- [ ] Run navigation assertions, web typecheck, and production build.

### Task 2: Role defaults and permission-grant canonicalisation

**Files:**
- Modify: `backend/apps/api/src/web/queries.ts:DEFAULT_NAV,MODULE_TAB`
- Create: `backend/apps/api/src/scripts/test-navigation.ts`

**Interfaces:**
- Produces canonical role tabs from `getBootstrap(dbName)`.
- `perm_matrix` grants add only owner tabs mapped by `MODULE_TAB`.

- [ ] Write assertions for every role: unique tabs, Today/Home first, no forbidden specialist default, and no duplicate canonical destination.
- [ ] Run test; verify legacy default map violates expected target roles.
- [ ] Replace role defaults with target navigation from the approved design, keeping no role over seven top-level entries.
- [ ] Expand `MODULE_TAB` only for canonical parent workflows.
- [ ] Run navigation test, API typecheck, and RLS test.

### Task 3: Role overview contract and existing pulse audit

**Files:**
- Modify: `frontend/apps/web/src/app/app/RolePulses.tsx`
- Modify: `frontend/apps/web/src/app/app/page.tsx`
- Modify: `frontend/apps/web/src/app/app/AdminPulse.tsx`
- Create: `frontend/apps/web/src/app/app/dashboardContract.ts`

**Interfaces:**
- `dashboardContract` defines role primary action, KPI labels, trend requirement, operational-chart requirement, and allowed secondary routes.
- Each role pulse consumes only data scoped to its role.

- [ ] Write contract assertions for all twelve roles.
- [ ] Remove teacher “Your tools” general tool grid; retain only role-owned action links.
- [ ] Remove repeated generic announcement surfaces where a role already has a dedicated queue; retain one school-announcement card for roles allowed to receive it.
- [ ] Map each current pulse against its contract and add explicit missing-state cards rather than misleading zeros.
- [ ] Run web typecheck and inspect desktop/mobile dashboard rendering.

### Task 4: Overview charts and data gaps

**Files:**
- Modify: `backend/apps/api/src/web/queries.ts` role pulse functions only where a contract field is absent
- Modify: `frontend/apps/web/src/lib/api.ts` matching typed API contracts
- Modify: `frontend/apps/web/src/app/app/RolePulses.tsx`
- Modify: `backend/apps/api/src/scripts/test-rls.ts`

**Interfaces:**
- Each pulse returns its named KPI values, one trend series, one operational distribution, and exception queue.
- Queries use `withRlsSession` semantics and never expand row/field visibility.

- [ ] For each role, list existing pulse fields against required chart fields before adding queries.
- [ ] Add only missing RLS-scoped aggregate queries; no raw cross-role data to client.
- [ ] Render trend/distribution using existing `@mandela/ui` primitives with labels, values, empty state, and no color-only meaning.
- [ ] Add RLS assertions for new restricted aggregates: guardian family-only, teacher own-class, specialist assignment-only, leadership only where intended.
- [ ] Run API/web typechecks, RLS suite, security test, and production build.

### Task 5: Flow and page consistency audit

**Files:**
- Modify only affected page routes under `frontend/apps/web/src/app/app/`
- Modify matching API query/controller files only for confirmed broken flow
- Modify: `.planning/2026-09-29-system-audit/{task_plan.md,findings.md,progress.md}`

**Interfaces:**
- Each visible module has one owner, loading/error/empty states, and a role-allowed entry path.

- [ ] Crawl every canonical route as an authorized role in development.
- [ ] Classify result as keep, merge-entry, redirect, or remove-from-role-default; record every decision.
- [ ] Fix confirmed broken flows with TDD and preserve old deep links.
- [ ] Run typecheck, build, RLS, audit, and diff check.

## Execution sequence

Implement Task 1 and Task 2 as navigation release. Review real role navigation before dashboard data changes. Implement Tasks 3–5 in role batches: leadership/finance, academic, specialist/guardian.
