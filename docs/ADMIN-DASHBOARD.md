# Mandela — Admin Dashboard & School System (Developer Guide)

> **Send this to a developer.** It explains what the system is, who uses it,
> where the code lives, the laws every change must obey, and the exact recipe
> for adding the next module — because **there will be more we will add.**
>
> **Companion docs (read after this one):**
> - `docs/ADMIN-BLUEPRINT.md` — the master module map: all 44 modules, statuses,
>   phases, sale-readiness gap analysis, the two-leaders model, calm-IA nav map
> - `docs/MODULES.md` — per-module build status across all six role dashboards
> - `docs/CURRICULUM-ARCHITECTURE.md` — how any curriculum (CBE/8-4-4/British)
>   is configuration, not code
> - `docs/FORM-NAV-STANDARDS.md` — evidence-based form & navigation rules
> - `docs/FEE-REALITY-CHECK.md` — Kenyan fee-collection realities → data model

---

## 1. The product in one paragraph

Mandela is a **multi-tenant school management system** sold primarily to
**Kenyan private schools**. One Postgres cluster, one database per school;
every screen reads and writes the school's own DB through RLS-gated APIs.
Any curriculum works because curriculum packs are data (migrations 008–010).
The buyer is usually the **owner/administrator** — a business operator who
watches three numbers: **fees in, enrolment, compliance**. Everything we
build must feed one of those three, or it's bloat.

## 2. The people and their dashboards

Six roles exist today (`user_role` enum: `admin, principal, teacher, bursar,
counter, driver`) plus the guardian (parent) surface. **Admin ≠ Principal** —
private schools employ the principal to run teaching while the admin/owner
runs the business (research in blueprint §0.5). Each role gets *fewer tabs,
not a smaller dashboard*:

| Role | Tabs | Owns |
|---|---|---|
| **Admin** (owner) | Today · People · Money · Reports · Settings | The whole business: money, register, HR, compliance, audit, settings. Sees every sector's vital signs on the pulse. |
| **Principal** | Today · Approve · Insights · Broadcast · Directory | Educational leadership: approves assessments/report cards, classroom analytics, broadcasts. Reaches the admin's world only via the **Approvals Inbox** (requests are audited). |
| **Bursar** | Today · Collect · Reconcile · Levies · Fee Reports | Money's day-worker: record payments, confirm pending, levies/consent, fee reports. Zero staff rows, zero assessments (RLS). |
| **Counter** (receptionist) | front-desk surfaces | Visitor log & gate passes, library/store counter, admissions inquiries at the door. Smallest scope by design. |
| **Teacher** | Today · Mark · Homework · Messages · Class | Attendance in two taps, homework, assessment capture — **own classes only** (RLS). |
| **Driver** | Route · Manifest · Done | Transport operations (activates when transport tables land). |
| **Guardian** (parent) | Home · Pay · Homework · Messages · Profile | Sees **only their own children**, ever (RLS-verified). |

**The approval loop** (the two-leaders hinge): principal/bursar/counter
*request* → admin's Approvals Inbox (module ㊱) → approve/reject with a
mandatory reason → everyone's actions land in the append-only audit trail.

### The staff lattice — hats, not roles (blueprint §0.6)

Kenyan schools are full of named hats — **deputy principal/head teacher,
discipline master, guidance & counselling teacher, HOD/senior teacher,
exams officer, class teacher, patron, librarian, dorm parent, janitor/**
caretaker** (duties
sourced from the official TSC Career Progression Guidelines). One person
normally wears several (deputy + HOD + class teacher is routine). So the
system keeps `user_role` at six values and models every hat as a
**`staff_duty` row** (staff + duty kind + scope + appointed_by + dates,
audited). Duties unlock conditional surfaces: the deputy gets oversight
cards and first-line approvals; the discipline master gets the Conduct tab
(㊹: incidents, merits/demerits, detentions, parent notifications); the
G&C teacher gets a confidential Welfare tab (㊺ — extra-strict RLS, admin
sees only a count, never case contents); the exams officer gets the
marks-completion tracker; the librarian and patrons get the My-Section
pattern (㊸a). The registry screen is **Duties & Appointments (㊻)** in
Settings — appoint, re-assign, end a duty, all audited.

## 3. Where the code lives

```
backend/
  db/school/001…015_*.sql     ← checksummed migrations; RLS policies live here
  apps/api/src/
    web/queries.ts            ← all SQL reads/writes (parameterized, cents-safe)
    web/web.controller.ts     ← REST endpoints, role checks, zod validation
    provisioner/migrator.ts   ← runs migrations per tenant at provisioning
    scripts/seed-demo.ts      ← demo data (admin row: "Njeri Kamau")
frontend/
  apps/web/src/
    app/app/                  ← one folder per screen; AdminPulse.tsx = Today
    app/navModules.tsx        ← NAV_CHILDREN: sidebar sub-module map (data)
    components/               ← SearchBox, BellMenu, ProfileMenu, NavPill
    lib/api.ts                ← typed API clients (server-side reads)
  packages/ui/                ← design system: tokens.css, Card/Kpi/Charts/
                                Button/DataTable/Motion (+ BRAND.md contract)
.freebuff/run.md              ← how to run the stack locally
```

**Run it:** API on :4000 (owns embedded Postgres :54329), web on :3000.
⚠️ **Migrations do NOT auto-run at API boot** — after adding a migration:
`pnpm --filter @mandela/api migrate`. Full recipe in `.freebuff/run.md`.

## 4. The laws (every change obeys all of them)

1. **No hardcoding** — every label, tab, fee, roster, name comes from the
   school DB (`school_settings` + school tables). Grep for magic strings.
2. **RLS is the security floor** — policies in migrations, `mandela_app` role
   with session GUCs. App-level role checks are UX, not security.
3. **Every write is audit-logged** — `audit_log` is append-only; API
   mutations write rows (see payment record/confirm in `queries.ts`).
4. **Integer cents everywhere** — never floats in money.
5. **3-tap rule & calm nav** — ≤7 groups; sub-modules are independent screens
   with their own cards/forms/charts; merged features live as tabs inside a
   screen (blueprint §1.5); desks appear in nav **only when enabled**
   (capability flags — a school without buses never sees Transport).
6. **Forms follow `FORM-NAV-STANDARDS.md`** — one column, top labels, inline
   validation, CSV import for bulk entry.
7. **One accent color per screen** — COINEST skin: sage canvas, pine `#123b31`
   ink, lime `#8de24f` accent, Poppins headings; tokens in
   `frontend/packages/ui/tokens.css` (contract in `BRAND.md`).
8. **Sections are rows, not modules** — see §6.
9. **Money is manual-first** — the bursar keys invoice and receipt data by
   hand as the primary path (Collect/Confirm ✅ work exactly this way).
   M-Pesa Daraja and bank rails (⑭) stay **ready but optional assists** —
   they pre-fill and suggest matches; they never become a dependency, and
   the system must be fully operable the day rails are off (API down,
   Paybill pending, power cut).

## 5. Current build state (Admin surface)

✅ **Live:** Today pulse (real animated cashflow/donut charts, hover tooltips,
count-ups), school-wide search, notifications bell, profile menu, Staff
Register (+ HR fields tsc_no/national_id), Learners, Guardians & Parents
(CSV import/export), Exam Entries (KEMIS readiness), Money's four modules
(Collect/Confirm/Levies/Reports), Insights, Terms & Calendar, Audit Trail,
approval-RLS for admin writes (migration 015). RLS behavioral suite green;
61-check module harness.

🟡→⚪ **Next (blueprint Phase 1):** Fee Structures editor, Invoices &
Statements, Admissions funnel, Compliance Center, Curriculum Setup UI.
**Platform before/with those:** real auth (replace dev email-match),
onboarding wizard, M-Pesa Daraja, WhatsApp worker, CSV import everywhere —
the seven sale-blockers in blueprint §6.3.

## 6. The rest of the school — sections, not module sprawl

A school has many activities beyond teaching: **laboratory, sports, drama,
music/singing, clubs, mess/canteen, security, infirmary, dormitories,
transport, library**. Competitors ship one bulky module per activity.
**We ship one Sections engine (blueprint ㊸)**:

- A **section is a row**: name + kind (`lab · sports · drama · music · club ·
  mess · security · infirmary · library · store · transport`) + `enabled`
  flag + **`head_staff_id` = the patron**.
- **Patrons:** the principal appoints peer teachers to run sections (Kenyan
  reality: "Drama & Music Club Patron", "Games master" — often several hats
  per teacher). The appointment is data + an audited event; **no new role
  enum** — patron is a capability of a teacher row. **The surface:** the
  patron's dashboard gains one conditional tab — **Section** (a "My Section"
  screen with internal tabs: Register (session roll-call) · Kit (issue/return
  with custody history) · Events (calendar + approval-gated announcements) ·
  Money (read-only levy status; purchases go through the Approvals Inbox).
  RLS: teacher reads/writes a section only where `head_staff_id` = own staff
  row — the teacher-owns-classes pattern. Spec: blueprint ㊸a.
- **Every section gets the same four capabilities** — kit (stock tables
  tagged to the section), money (consent-gated levies through Money),
  events (fixtures/festivals → calendar + guardian announcements), register
  (member learners + session attendance).
- **Named special cases:** Security = visitor log + gate passes written by
  `counter`; Mess = weekly menu + store-linked stock + meal head-counts;
  **Infirmary** = health records (allergies/chronic/immunizations),
  clinic-visit log, medication charted-as-given with stock auto-deduction —
  DPA-strict RLS (duty-holder + principal; admin sees counts only; allergy
  flags reach class teacher + dorm parent only). Dormitories = the Hostel
  desk ㉓: **beds/mattresses/trunks are asset rows (㊴) whose room is the
  dorm**, boarder↔bed allocation per term (damage costs flow to that
  student's fee ledger), exeat passes with guardian consent, nightly
  roll-call from the dorm parent's phone, mess head-count forecast from
  out-passes (blueprint ㉓).
- Nav shows only enabled sections (capability flags); the pulse carries one
  **Sections** vital sign. Tables: `section`, `section_member`,
  `visitor_log` (blueprint §6.1, Phase 2).

This is how we cover "so many functions and activities" **with simplicity**:
one pattern, rows not apps, menus that stay quiet until the school uses a
desk.

## 7. The recipe — adding a new module (memorize this)

1. **Migration** `backend/db/school/0NN_name.sql` — tables + CHECKs + RLS
   policies (`admin/principal` floor; follow 015's pattern) + indexes.
   **Run `pnpm --filter @mandela/api migrate`** — boot does not migrate.
2. **Queries** in `web/queries.ts` — parameterized SQL, cents as bigint,
   audit rows inside the same mutation helper as the write.
3. **Endpoint** in `web.controller.ts` — zod schema per field, role check
   (`admin`/`principal` unless the module says otherwise), thin controller.
4. **API client** in `frontend/apps/web/src/lib/api.ts` — typed response.
5. **Screen** `frontend/apps/web/src/app/app/<group>/<module>/page.tsx` —
   server component fetching via `lib/api`; client components for forms;
   `KpiCard`/`Card`/`Charts`/`DataTable` from `@mandela/ui`; one accent.
6. **Nav** — add the child in `navModules.tsx` (`NAV_CHILDREN` + icon);
   page title in the shell map. Conditional desk? Honor the `enabled` flag.
7. **Gates** — `pnpm --filter @mandela/web typecheck` and
   `pnpm --filter @mandela/api typecheck` green; RLS suite
   (`pnpm --filter @mandela/api test:rls`) green; extend the module harness;
   browser pass as `admin@demo.mandela.school`; verify in the preview tab.

## 8. Where the roadmap lives

`docs/ADMIN-BLUEPRINT.md` is the single source of truth for **what's next**:
44 numbered modules with statuses, seven nav groups, the calm-IA fold,
phases 1–3, sale-readiness gaps (§6), and the exclusions list with reversal
triggers. Update it **before** building anything new — the rule is:
document, then build. New modules must name which of the three buyer numbers
(fees in · enrolment · compliance) they feed, in writing, first.
