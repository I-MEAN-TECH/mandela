# Module Audit — 2026-09-29

## Scope and confidence

This is a source and route-contract audit of every visible sidebar module and
the operational routes it links to. It is not a claim that every mutation has
been exercised end-to-end. Live browser evidence covers Counter navigation and
Money payment selection; route, icon, and role-default evidence covers all
current sidebar entries.

## System inventory

| Group | Canonical modules | Status |
|---|---|---|
| Money | Collect Cashier; Fee Structures; Levies; Invoices & Statements; Fee Reports | Canonical routes and unique child icons verified. Pocket, rails, petty cash, purchases, and payroll remain valid specialist routes. |
| Spend | Payroll; Petty Cash & Budgets; Purchases & Suppliers | Valid admin/finance workflow group. Payroll route differs between legacy and canonical paths; retain redirects/deep links during later cleanup. |
| People | Admissions; Staff Register; Learners; Guardians & Parents; HR & Leave; Alumni | Canonical routes verified. Admissions has the strongest explicit Counter role gate. |
| Academics | Curriculum Setup; Timetable; Attendance Oversight; Exams, Entries & Report Cards; Library | Valid routes. Curriculum and attendance are leadership-gated; teacher exam scope is server-derived. |
| Operations | Sections & Patrons; Events & Calendar; Duty Rosters; Facilities & Repairs; Transport | Valid routes. Several specialist surfaces are routed through Operations but appear as role-specific top tabs. |
| Care | Hostel & Mess; Infirmary & Security; Conduct & Welfare; Houses & Co-curricular; Media Consent | Valid routes. Infirmary and conduct use stricter role checks; security is Counter-allowed. |
| Insights | Compliance Center; Documents Vault; Audit & Switching; Report Builder | Valid routes. Audit uses a Settings anchor; switching import is a separate route. |
| Settings | School Profile & Terms; Users & Duties; School Health; Board & BOM; Flags & Integrations | Valid routes. Team/permissions/health need admin or leadership checks. |
| Teacher | Mark; My Class; Homework; Messages | Role dashboard and first-run attendance path exist. |
| Guardian | Home; Pay; Homework; Messages; Profile | Dedicated guardian routes and role-specific home exist. |
| Cross-cutting | Today dashboards; approvals; inbox; broadcast; directory; reconcile; laundry; reports | Existing operational routes, deliberately not all shown as global sidebar groups. |

## Current role navigation

| Role | Visible modules | Assessment |
|---|---|---|
| Admin | Today, Money, Spend, People, Academics, Operations, Care, Insights, Settings | Full system owner; 9 tabs is intentionally broader than specialist roles. |
| Principal | Today, Operations, Approve, Reports, Broadcast, Directory, Academics | Leadership workflow; 7 tabs. |
| Bursar | Today, Collect, Reconcile, Levies, Reports | Finance-only flow; 5 tabs. |
| Teacher | Today, Mark, Homework, Messages, Class | Classroom-only flow; 5 tabs. |
| Counter | Today, Visitors, Inquiries, Directory | Front desk only; fixed during this audit. |
| Driver | Today, Transport | Road workflow; 2 tabs. |
| Dorm parent | Today, Hostel, Laundry | Boarding workflow; 3 tabs. |
| Janitor | Today, Facilities, Store | Facilities workflow; 3 tabs. |
| Librarian | Today, Library, Directory | Library workflow; 3 tabs. |
| Patron | Today, Sections, Houses, Events | Co-curricular workflow; 4 tabs. |
| HOD | Today, Academics, Exams, People, Insights | Department oversight; 5 tabs. |
| Guardian | Home, Pay, Homework, Messages, Profile | Family workflow; 5 tabs. |

## Verified improvements

- All 41 canonical child modules have a route owner and a distinct icon.
- All live role-default tabs have declared routes and distinct semantic icons.
- Generic dashboard-icon fallback is removed; undeclared navigation now fails
  fast instead of rendering a duplicate glyph.
- Counter no longer receives Money, Operations, or Insights merely because it
  has supporting data permissions.
- Money payment selection is capped at five learners with search, class filter,
  and View all / Show less.

## Risks and cleanup queue

| Priority | Finding | Required action |
|---|---|---|
| P0 | Production OTP delivery remains unimplemented. | Implement delivery provider and production verification before calling guardian login production-ready. |
| P1 | Documentation says `perm_matrix` grants change navigation live; code now correctly uses grants only for access and role defaults for navigation. | Update SYSTEM-OVERVIEW, DEV-PHASES, seed-branding comments, and settings copy to one policy. |
| P1 | Route guards vary: some pages explicitly list allowed roles, others only require staff and rely on RLS. | Execute a role-by-route authorization matrix; add page guards where broad empty or confusing screens appear. |
| P1 | Legacy routes and labels remain in icon registry for old data/deep links. | Keep compatibility now; inventory traffic and redirect/remove only after migration evidence. |
| P2 | "All filters on all forms" is not safe as a blanket rule. | Standardize search/class filters only for large record selectors and lists; do not add irrelevant filters to creation forms. |
| P2 | Module documentation describes more grants and tabs than current product policy. | Regenerate catalogue from typed registry after the role-route matrix is complete. |

## Page-gate audit

The source contains 61 route pages under `/app`. Page checks are a usability
boundary only; API role checks and PostgreSQL RLS remain the security boundary.

| Gate quality | Modules | Assessment |
|---|---|---|
| Explicit allow-list | Admissions, invoices, payroll, pocket money, rails, consent, events, rosters, sections, security, vault, conduct, HR, team, board, health, switching import | Best pattern. Denied users return to their role home instead of receiving an empty screen. |
| Leadership-only | Curriculum, attendance oversight, staff register, guardian register, exam entries, payroll/HR administration, board, team, school health | Correct intent; individual route guards vary in wording but enforce the same broad boundary. |
| Staff-only, RLS-dependent | Academics home, approve, broadcast, directory, levies, mark, money cashier, reports, facilities, houses, library, mess, store, transport, learner register, alumni, settings, insights | Needs a role-by-route UI pass. These pages may render an empty or reduced screen for a staff role that does not own the workflow, even where RLS correctly blocks data. |
| Special case | Guardian pay/profile/homework/messages; role dashboards; `operations` home | Must remain separate because the guardian and specialist dashboard data shapes differ. `operations` needs dedicated guardian-denial review. |

### Confirmed design drift

- `SYSTEM-OVERVIEW.md` still describes Counter Calendar and grant-added sidebar
  modules. Current product policy is Counter: Today, Visitors, Inquiries,
  Directory; permissions may enable data operations but never sidebar modules.
- `seed-branding.ts` persists an older `nav_json` map that is no longer used by
  bootstrap navigation. This is not runtime breakage, but it is misleading
  operational data and should be removed or made a compatibility mirror.
- The `CHILD_ICONS` registry retains legacy labels to preserve old data. They
  do not appear in current default navigation, but future migrations must not
  reintroduce those labels as visible modules.

## Evidence

- `frontend/apps/web/src/app/app/navModules.tsx` owns canonical child modules,
  first-level destinations, and visible icon declarations.
- `backend/apps/api/src/web/queries.ts` owns `DEFAULT_NAV` and no longer turns
  supporting permission grants into sidebar modules.
- `pnpm --filter @mandela/web test:navigation`, role-pulse and payment tests,
  web typecheck and production build, API navigation/typecheck/security/RLS
  gates, bundle budget, production dependency audit, live Counter browser pass,
  and Money-page axe audit passed during this audit. Server-rendered login and
  dashboard responses were verified for all eleven staff demo roles.
