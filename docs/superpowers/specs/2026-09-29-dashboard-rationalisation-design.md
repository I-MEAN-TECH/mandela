# Dashboard and Module Rationalisation Design

## Goal

Make Mandela dashboards task-first, role-scoped, icon-complete, and free of duplicate navigation while preserving every existing capability behind one canonical destination.

## Current problem

`DEFAULT_NAV` exposes broad menus to every role. `NAV_CHILDREN` duplicates destinations under several parents and labels. `AppShell` and `SubChips` then fall back to a generic icon when a label is not registered. The result is crowded navigation, repeated pages, and dashboards that act as module directories rather than morning workspaces.

## Product rules

1. One workflow has one canonical route and one navigation owner.
2. A role sees a workflow only when it is needed for that role's current work or an explicit permission grant exposes it.
3. A dashboard answers one role-specific daily question, prioritises exceptions, and presents one primary action.
4. Every visible navigation item uses an accessible Lucide icon from one typed registry. No generic fallback icon.
5. Existing URLs remain available as redirects or deep links. Removing a navigation item never deletes data or permissions.
6. RLS and server-side role checks remain the authority. Navigation only reflects permissions.

## Canonical information architecture

| Owner | Canonical workflows | Excluded duplicates |
| --- | --- | --- |
| People | admissions, learners, guardians, staff, HR, alumni | counter "Inquiries" becomes Admissions entry point; Directory becomes search/profile capability, not a main workflow |
| Academics | curriculum, timetable, attendance, assessments/report cards, library | exams/entries share one assessment workspace; Library leaves broad academic navigation |
| Finance | collection, invoices/statements, fee structure and levies, reconciliation, payroll, petty cash, purchasing | reports become contextual finance insight, not another finance door |
| Operations | sections, events, duty rosters, facilities, transport, store, visitors, documents | Store leaves Spend and Facilities submenus |
| Care | hostel/mess, infirmary, safeguarding/visitors, conduct/welfare, houses, consent | security is not bundled with infirmary in label or permissions |
| Insights | leadership trends, compliance, report builder, audit | no operational module is duplicated here |
| Settings | school profile/term, users/duties, school health, board, integrations | flags and integrations remain separate settings sections, one settings owner |

## Role navigation target

| Role | Main tabs | Dashboard focus |
| --- | --- | --- |
| Admin | Today, People, Academics, Finance, Operations, Care, Insights, Settings | school exceptions, approvals, setup debt |
| Principal | Today, Academics, Operations, Insights, Approvals, Messages | attendance, incidents, approvals, academic/financial exceptions |
| Bursar | Today, Finance, Messages | collection, reconciliation, arrears, approvals |
| Counter | Today, People, Finance | visitors, admissions, learner lookup, receipt intake |
| Teacher | Today, My Class, Academics, Messages | timetable, attendance, marking, homework, student exceptions |
| HOD | Today, Academics, People, Insights | coverage, assessment completion, teacher/class exceptions |
| Guardian | Home, Children, Fees, Messages, Profile | child updates, balances, homework, school notices |
| Driver | Today, Transport | route, manifest, trip exceptions |
| Dorm parent | Today, Hostel, Care | roll call, exeats, welfare/incident queue |
| Janitor | Today, Facilities | assigned repairs and supply needs |
| Librarian | Today, Library | due/overdue and circulation queue |
| Patron | Today, Sections, Houses, Events | section commitments, house standings, event duties |

Specialist tabs are removed from non-specialist defaults. Explicit `perm_matrix` grants may add a canonical owner tab, never a duplicate shortcut.

## Dashboard composition

Every dashboard has this fixed hierarchy:

1. One action card: highest-value action for today.
2. A role-specific overview: three to four decision KPIs, trend chart, and one distribution, workload, or status chart.
3. Exception queue: overdue, unconfirmed, unmarked, unassigned, or safety-sensitive work.
4. Today/next schedule where applicable.
5. Secondary links limited to role-owned workflows.

No dashboard renders a general "all tools" grid. Search and sidebar provide discovery. Existing role pulses supply much of the data; new widgets require a query only when a required exception is not already available.

### Required overview per role

| Role | KPI cards | Trend or graph | Operational chart |
| --- | --- | --- | --- |
| Admin | attendance, collection, open approvals, unresolved exceptions | 14-day attendance | exception count by workflow |
| Principal | attendance, incidents, approvals, collection | attendance trend | absences/incidents by class |
| Bursar | collected today, collection rate, pending confirmations, arrears | seven-day collections | arrears by class |
| Counter | visitors, active inquiries, admissions pending, receipts today | daily visitor/inquiry activity | inquiry pipeline by stage |
| Teacher | present, homework due, unmarked assessments, messages | attendance history | class attendance status grid |
| HOD | coverage, unmarked work, assessment completion, class risk | department completion trend | subject/class completion comparison |
| Guardian | balance, attendance, homework due, unread messages | attendance trend for each child | fee payment progress per child |
| Driver | boarded, expected, route exceptions, completed trips | trip completion trend | route-stop boarding status |
| Dorm parent | in residence, exeats, unresolved welfare items, roll-call completion | nightly roll-call trend | residence status by dorm |
| Janitor | assigned repairs, overdue repairs, resolved this week, supply alerts | repairs resolved trend | repair status by priority |
| Librarian | loans out, overdue loans, returns due, holds | circulation trend | overdue loans by class |
| Patron | section attendance, house points, open duties, upcoming events | section engagement trend | house standings |

Charts use existing `@mandela/ui` chart primitives where possible, are text-labelled and keyboard-readable, and have a useful empty state. Data stays scoped to the signed-in role's RLS permissions.

## Technical design

- Replace string-keyed `ICONS`, `NAV_CHILDREN`, `CHILD_ICONS`, and `tabToHref` with one typed module registry in `frontend/apps/web/src/app/app/navModules.tsx`.
- Registry owns canonical route, label, Lucide icon, parent workflow, and permitted child entries. `AppShell` and `SubChips` consume it; no fallback glyph.
- Update backend `DEFAULT_NAV` and `MODULE_TAB` so permission grants resolve to canonical top-level tabs.
- Retain existing page routes. When a legacy navigation destination duplicates a canonical route, preserve it as an internal deep link or redirect only after route-level review.
- Audit each pulse component against its role's daily question. Remove broad tool grids and replace with role-owned next actions; add data only through validated API queries and RLS-scoped endpoints.

## Delivery phases

### Phase A: Navigation correctness

Build canonical registry, replace duplicate default navigation, ensure every visible item has a named icon, and test all role navigation maps.

### Phase B: Dashboard usefulness

Refine each existing role pulse into action, KPI, exception, and schedule layers. Implement only missing data required by a defined daily decision.

### Phase C: Workflow coverage

Audit every page for empty, broken, duplicate, or permission-inconsistent flows. Add narrowly scoped missing flows only after they are assigned to a canonical owner and backed by API, RLS, validation, loading, error, and empty states.

## Non-goals

- No new dashboard framework, theme, route rewrite, or generic widget builder.
- No new module solely because competitors list it.
- No client-side permission enforcement in place of API/RLS.

## Acceptance criteria

- No duplicate destination appears in default role navigation.
- Every visible navigation item has an explicit icon.
- Each role's default navigation has at most six main tabs plus its dashboard.
- Every role dashboard exposes its daily primary action and exception queue.
- Existing authorized deep links keep working.
- Navigation and dashboard changes pass typecheck, production build, accessibility review, and role/RLS regression checks.
