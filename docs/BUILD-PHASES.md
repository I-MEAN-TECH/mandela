# Build Phases — every dashboard, in order

> The execution companion to `ADMIN-BLUEPRINT.md` (the what/why) and
> `ADMIN-DASHBOARD.md` (the laws/recipes). This doc is the **build queue**:
> phase → dashboard → module → slice → gate. Update the checkboxes as work
> lands; never build anything that isn't a line here (or add the line first).
>
> Gates every slice must pass: typecheck (web + api) · RLS suite ·
> `pnpm --filter @mandela/api migrate` after new migrations · module-harness
> checks · browser pass as `admin@demo.mandela.school` · preview verified.

---

## Legend

`[ ]` not started · `[~]` in progress · `[x]` done · (🔮) parked past Phase 3.

---

## Phase 0 — Foundations (done)

- [x] Tenancy + provisioner + checksummed migrations (001–015)
- [x] RLS behavioral suite + module harness
- [x] Design system `@mandela/ui` (COINEST skin: sage/pine/lime, Poppins)
- [x] Admin Today pulse (live charts, search, bell, profile)
- [x] People: Staff Register / Learners / Guardians & Parents / Exam Entries
- [x] Money: Collect / Confirm / Levies / Fee Reports (bursar shared)
- [x] Settings: School Profile / Terms & Calendar / Audit Trail
- [x] Curriculum packs 008–010 (CBE / 8-4-4 / British)

## Phase 1 — Money & Compliance term (NOW — admin dashboard deepened)

Owner: **Admin dashboard**. Everything here feeds "fees in" or "compliance".

- [x] **⑫ Fee Structures** — ✅ built & verified (2026-09-12)
  - [x] Migration 016: `sibling_discount` (rules) + `instalment_plan` /
    `instalment` (per-learner schedules) + RLS + indexes — applied
  - [x] Queries: list, upsert structure, bulk-apply (assist, audited),
    discount CRUD, plan CRUD
  - [x] Endpoints: GET/POST `admin/fees/*` (zod, money-role floor)
  - [x] Screen `/app/money/fees`: KPI cards, structures table with Apply
    assist, discount rules, instalment plans + the three forms
  - [x] Preview pass: discount write + apply assist verified end-to-end
    (audit lines `fee.discount.upsert`, `fee.bulk_apply` confirmed in DB;
    dedupe guard returned an honest "0 bills created" on already-billed class)
- [x] **⑬ Invoices & Statements** — ✅ built & verified (2026-09-12)
  - [x] No migration — statement engine over fee_item + payment_allocation
    (consent-aware billed, FIFO waterfall paid, credit shown honestly)
  - [x] Same-query trust fix: staff + guardian endpoints call the one
    `learnerTermStatement` function
  - [x] Manual invoice entry (audited, loud duplicate refusal) + statement
    sheet with school letterhead, stable invoice no, print CSS
  - [x] Screen `/app/money/invoices`: KPIs, ledger table sorted by balance,
    statement overlay; verified live (bill write → KPI 75,000→77,500;
    refusal message; audit `invoice.item.create` ×1)
- [x] **③ Admissions** — migration 017 (`admission_inquiry` + RLS + nav); funnel board
  with audited stage moves; auto admission-no (ADM-mint max+1); sibling auto-link
  by phone; screen `/app/people/admissions` — verified live (inquiry → visit →
  assessment → offered → enrol as ADM-007, Grace Otieno linked by 254733000001;
  audit `admission.inquiry.create`/`stage.move`×3/`convert`)
- [x] **㉘ Compliance Center** — migration 018 (`compliance_line` + RLS); screen
  `/app/insights/compliance`: live KEMIS/TSC rollup + licence checklist, countdown
  chips, fix deep-links, CSV export — verified live (floor 0%, KEMIS 25%, "Fix 7
  learner records →" deep-link, done-toggle audit `compliance.line.update`)
- [x] **⑯ Curriculum Setup** — migration 017 pack controls (enabled/default/vocab);
  screen `/app/academics/curriculum` + Academics nav group; class ladder mover;
  `curriculumContext()` resolver with live probe panel — verified live (pack
  disable/re-enable with class-count guard, CBE vocab + BE–AE–ME–EE scale render
  from pack data; audit `curriculum.pack.set`)
- [x] **㊲ platform: retention policy page** (§6.5 #8) — audit forever + editable
  backup regime/export window in Settings#retention — verified live (audit
  `settings.retention.set`)

**→ PHASE 1 COMPLETE.** Gates at close: typecheck web+api green · RLS suite green ·
migrations 016–018 applied · every screen above verified live in the preview as admin.

## Phase 2 — Operations term

- [x] **㊱ Approvals Inbox + ㊲ Tasks** — migration 019 (`approval_request` +
  `admin_task`, typed states, RLS, seeded licence/KEMIS tasks); screen `/app/inbox`
  (raise form, queue with age chips, mandatory-reason decision dialog, tasks board
  with Done/Drop + add form); Today pulse "Needs you today" card + Inbox tile;
  guards: mandatory reason (zod min 4 + SQL check), self-decision block, role floor.
  Verified live end-to-end: admin raises purchase Ksh 24,000 → principal sees
  Approve/Reject → approves with reason → "decided by Demo Principal" + reason
  quoted in Recent decisions; audit `approval.raise`/`approval.decide`/
  `task.create`/`task.complete`
- [x] **⑦ Payroll** — contracts, versioned `statutory_rates`, run
  draft→computed→approved→disbursed (020 + 021 fix: payslip INSERT policy +
  cents-normalized PAYE bands). Verified live: contract Ksh 35,000 → run →
  PAYE 2,253.33 / SHIF 962.50 / housing 525 / NSSF 2,100 → net 29,159.17,
  admin sign-off with reason → bank bulk-upload CSV disbursed; audit chain
  `payroll.contract.upsert → run.compute → run.approve → run.disburse`.
  Still open (Phase 2+): payslips by phone (Talk), remittance checklist in
  Tasks, leave proration, salaries-vs-collections chart
- [x] **⑭ Money Rails** — Daraja C2B → *suggested* entries (assist); bank CSV
  import with match-suggestions; manual-entry share card. Verified live:
  3-row CSV paste → 1 exact (ADM in ref, pre-selected) + 1 name-guess + 1
  unmatched (Confirm disabled) → confirmed row became a pending payment
  (R-MTYKP6IE) linked to the rails row; audit `rails.import → rails.confirm`.
  Matching engine = admission-no-in-reference (1.000) / name-fragment (0.600);
  never auto-writes. Daraja C2B callback wiring is the remaining half (needs
  the platform credential; the rails_match.source='daraja-c2b' path exists)
- [x] **⑰ Attendance Oversight + ⑱ Exams & Report Cards** — coverage meters,
  approval queue, renderer (curriculum-adaptive per §4). ⑰ verified live:
  Felix 60% absent flagged w/ deep-link, per-class compare, 7-day trend.
  ⑱ verified live: coverage 0% → seeded assessments → 57% (4 of 7), card
  generated for Amina → CBE vocab (Learner/Learning Area from pack) in
  payload, approve flow audited. Remaining: guardian-facing issued-card
  view + print, per-area coverage inside a class
- [x] **㉝ Users & Roles + ㊷ Permissions Matrix + ㊻ Duties registry + ㉟ Integrations** —
  Users table w/ audited role changes + last-admin guard; matrix as data
  (owns/sees/landing per module×role, admin-editable, shapes nav/prompts
  only — the code role checks stay as the security floor); duties verified
  live (Test Bursar → Discipline Master · Upper Primary, audit `duty.assign`,
  multi-hat load counter); Integrations = connection health for
  WhatsApp/SMS/M-Pesa/email (secrets stay platform-side), admin toggles.
  Still open: better-auth/OTP invites + session list + force-sign-out;
  matrix actually driving nav visibility
- [x] **㊸ Sections & Patrons** — migration 023 (section/member/session/mark +
  kit tag via stock_item.section_id); register screen + detail drawer; patron
  hat auto-writes to Duties (patron-of:<id>, audited). Verified live: create
  'Science Lab' with patron → duty row + audit; member add; session held 1/1.
  ㊸a patron tab = teacher-dashboard surface, lands with Phase 4 dashboards
- [x] **㊹ Discipline & Merits + ㊺ Counselling** — Conduct & Welfare screen;
  merit recorded live (parent notified, audit `discipline.record`); counselling
  extra-strict RLS proven BOTH ways: admin sees counts only, principal ran the
  full case lifecycle (open → note → close; stats 0→1 closed) via `counselling_stats()` SECURITY DEFINER
- [x] **㊶ Board & BOM + ㊴ Facilities (lockers/desks/dorms) + ㉓ Hostel +
  Infirmary** — migration 024: board_member/meeting/decision, repair_report
  (janitor two-tap, repair-vs-replace verdict computed), dorm/bed + exeat,
  health_event (DPA-strict), board pack screen; verified live (verdict <50%
  rule → "replace")
- [x] **⑳ Transport + ㉑ Library + ㉒ Store** — route/bus/rider + manifest;
  book + loan (fines as levies); kit issue via stock tables; all screens live
  and E2E-verified through the real API
- [x] **㉔ Events & Calendar** — `school_event` table; calendar screen with
  KPIs + audited add-event form; verified live (Mid-Term Exams exam-window).
- [x] **② Learner 360 + bulk CSV import** — one profile (ledger = SAME
  listInvoices math, attendance, conduct, sections, guardians); roster rows
  deep-link in; import E2E: 2 created (auto ADM-022), 1 updated, 1 sibling
  link by phone, 0 skipped. Still open: media consent; switching import (§6.5)
- [x] **Calm-IA fold (§1.5)** — Insights renamed **Reports** (migration 024
  nav_json fold, applies to both leader roles); Operations children complete;
  capability flags (feature_flag) seed with the school and gate the
  conditional groups — toggle verified live end-to-end (UI flip → DB → audited
  `flag.set`). Sections vital sign added to the Today pulse

**PHASE 2 COMPLETE** (2026-09-22) — governance & depth landed; only deferred
polish and Phase 3 remain.

**Post-phase pass (same day):** print artifacts landed — `/print/report-card`
(guardian-facing, approved-only for guardians) + `/print/statement` (ONE
ledger math), both A4 outside the app shell, deep-linked from the approval
queue, statement sheet and Learner 360. Phase 2 quality sweep against
FORM-NAV-STANDARDS + BRAND: 2 two-column forms collapsed to one (Inbox,
Admissions), 24 raw Tailwind status colors migrated to token classes
(warn/danger/ok), font-poppins → font-display (3). Scanner-clean on raw hex,
reset buttons, and status colors.

**CRUD completion pass (same day):** every Phase 2 screen now answers "what can
I do here" — Learners gained Add (walk-in enrol, ADM auto-mint) + per-row Edit
(identity/class/boarder/UPI/birth-cert) + roster search + status filters +
status toggle on Learner 360; Guardians gained per-row Edit + active toggle;
Exam Entries gained the per-learner KEMIS fix dialog (UPI + birth cert);
Events gained Edit + Cancel per event; Transport gained the route on/off
toggle. All writes audited (`learner.update/create`, `event.update`,
`transport.route.state`) and verified live end-to-end — including catching and
fixing a real bug: `updateEvent`'s SQL bound 5 params to 6 placeholders
(missing `title`), which a 500 surfaced honestly in the dialog.

**Flank breadth pass (same day, verified live):** fee-item consent toggle +
consent desk + avg-fee card (⑫) · Admissions analytics (conversion card,
funnel bars, source donut, 6-month trend) · Payroll dashboard (salaries due
vs collected 36% headroom, statutory PAYE/SHIF/NSSF tasks auto-land in ㊲,
CSV export seam) · Security desk (sign-in → gate pass GP-#### → check-out,
visitor book live) · Mess (menu board + head-count ledger, 245 counted) ·
Learner 360 class-move history (reason-guarded, `class_move` ledger) +
guardian relationship editor (audited) · Exam-entry candidate numbers
(KPSEA/2027/0001 assigned; edit-path 500 found & fixed — UPDATE by id, audit
`exam_entry.upsert`) · My Section patron tab (Register/Kit/Money/Events) on
the teacher dashboard · **Purchases pipeline walked to paid** (PR-001,
Ksh 14,000, every gate audited) · RLS suite green · typechecks green.
Open flanks: bulk opt-in campaigns (runner), Daraja C2B callback (needs
platform credentials), disbursement reconciliation, payslips-by-phone.

## Phase 3 — Depth term

- [x] **⑥ HR & Leave + ⑲ Timetable** — migration 025 (`staff_leave` +
  `staff_leave_rules` entitlements + `timetable_slot` with the Mon–Fri × 9
  grid, RLS: any staff raise/read, two leaders decide/edit). Screens:
  `/app/people/hr` (out-today, decision queue with mandatory-reason dialog,
  recent trail, taken-vs-entitlement table) and `/app/academics/timetable`
  (class picker, week grid, slot dialog with area chips/teacher/room/time,
  **teacher-clash guard refuses with the clashing class named**, soft clear).
  Verified live: raise (2 sick days computed) → self-decision guard fired
  live in the UI → principal approved with reason via API (`leave.approve`)
  → out-today KPI + balances updated; slot fill → clash refused → different
  teacher saved → cleared (`timetable.upsert/clear` audited). Capability flag
  `timetable` seeded; nav + People hub cards wired.
- [x] **⑮ Petty Cash & Budgets + ㊳ Purchases & Suppliers** — DONE (2026-09-22,
  migration 026): petty till top-ups/spends with threshold→approval (Ksh 500
  pended → approved with reason → balance honest), budget lines vs spend;
  supplier register + six-state purchase pipeline (draft→submitted→approved→
  ordered→received→paid, leaders-only approve). Verified live: petty flow
  (`petty.record/approve` audited), **PR-001 walked every gate to paid**
  (`purchase.*` audited). (Found+fixed en route: audit_log entity_id NOT NULL
  broke NULL-entity writes.)
- [x] **㊵ Co-curricular** (Houses screen + engine, live) · **㉙ Report
  Builder v1** (3 datasets + CSV, live) · **㉞ Documents Vault** (templates
  + issue desk, live) · **Alumni** (register + mark-graduated, live) ·
  pocket money & laundry (wallet + custody, live) — 2026-09-24
- [x] **Flank closure** — DONE (2026-09-24, migration 032): duty rosters→Tasks
  fold (idempotent, audited), house competitions as calendar events, offline
  outbox (attendance only — money never queues, docs/OFFLINE-CONSTRAINTS.md),
  AI drafts draft-only (anomaly flag on Today + parent-message drafter on
  Insights), laundry custody per boarder. Live-verified: emit→re-emit 0,
  out→1 bag→in→0, flush applied/duplicate/money-reject, anomaly scan, drafts
  desk; web+api typecheck clean, RLS suite green
- [ ] bulk opt-in campaigns · multi-school groups (parked — needs product
  decision before build)

### Hardening — runs alongside Phase 3 (added 2026-09-24, owner decision)

The app is feature-broad but demo-grade in four places. These gate "a real
school can run on this" and are worked in parallel with the items above:

- [x] **Real staff auth** — SHIPPED: scrypt passwords + self-service set
      (audited) + 5/15min throttle; dev escape preserves demo logins.
- [x] **M-Pesa Daraja C2B end-to-end** — SHIPPED: guarded callback endpoint,
      replay-proof, suggestions the bursar confirms; live-verified exact
      match. Production = set DARAJA_* env credentials.
- [x] **WhatsApp sender worker** — SHIPPED: provider abstraction (simulate /
      Meta Cloud API), per-message provider_id + errors, audited. Production
      = set WHATSAPP_PROVIDER=meta + credentials.
- [x] **Deployment + backup runbook** — SHIPPED: docs/OPS-RUNBOOK.md +
      scripts/backup-school.sh (integrity-probed dumps, rotation, restore
      drill). Server hosting itself is the remaining ops action.
- [x] **Money-path test suite** — SHIPPED: scripts/smoke-money.mjs,
      record→receipt→statement→collections→report, ALL GREEN live.
- [x] **IA regroup — 8 mains × 4-5 children** — SHIPPED 2026-09-24:
      migration 030 + seed:branding (admin map), navModules.tsx 38 merged
      children, TwinLinks on every merged door, Report Builder slot page;
      verified live (sidebar 9 tabs, guards redirect, all routes 200).

## Other dashboards (after Admin Phase 1–2 stable)

- [ ] **Guardian app** — re-skin in COINEST; Home/Pay deep (balances via the
  same query ⑬); homework/messages polish
- [ ] **Teacher** — Mark/Homework refresh; assessment capture fully
  curriculum-adaptive; Section tab lands with ㊸
- [ ] **Principal** — Approve/Insights/Broadcast refresh; department views (HOD)
- [ ] **Bursar** — inherits Money modules as they land; Reconcile assist ⑭
- [ ] **Counter** — front desk: visitor log, admissions capture, library/store
- [ ] **Driver** — Route/Manifest/Done (needs transport tables ⑳)
- [ ] **Platform** — auth (better-auth/OTP), onboarding wizard, WhatsApp
  worker, backups/export, PWA offline reads

---

## Coverage check — every module has a phase (audit 2026-09-12)

All 47 blueprint modules + the patron surface, mapped. If a module isn't
here or in the blueprint, it doesn't exist.

| Group | Modules → phase |
|---|---|
| Today | Pulse ✅P0 · Approvals ㊱ P2 · Tasks ㊲ P2 |
| People | Staff ①✅P0 · Learners ②✅P0 (+360/CSV/moves ✅P2) · Admissions ③ ✅P1 (+analytics ✅P2) · Guardians ④✅P0 (+editor ✅P2 · campaigns open) · Exam Entries ⑤✅P0 (+candidates ✅P2) · Discipline ㊹ ✅P2 · Counselling ㊺ ✅P2 · HR & Leave ⑥ ✅P3 · Payroll ⑦ ✅P2 (reconcile + phone payslips open) |
| Money | Collect ⑧ Confirm ⑨ Levies ⑩ Fee Reports ⑪ ✅P0 · Fee Structures ⑫ ✅P1 (+consent/avg ✅P2) · Invoices ⑬ ✅P1 (+SMS/PDF P2) · Money Rails ⑭ ✅P2 (Daraja callback needs credentials) · Petty Cash ⑮ ✅P3 · Purchases ㊳ ✅P3 |
| Academics | Curriculum Setup ⑯ ✅P1 · Attendance Oversight ⑰ ✅P2 · Exams & Report Cards ⑱ ✅P2 · Timetable ⑲ ✅P3 · Co-curricular ㊵ P3 |
| Operations | Transport ⑳ ✅P2 · Library ㉑ ✅P2 · Store ㉒ ✅P2 · Hostel ㉓ ✅P2 · Events ㉔ ✅P2 · Facilities ㊴ ✅P2 · Sections & Patrons ㊸+㊸a ✅P2 (+Security/Mess ✅P2) |
| Insights | Collections ㉕ Attendance ㉖ Parent Reach ㉗ ✅P0 · Compliance ㉘ ✅P1 · Board & BOM ㊶ ✅P2 · Report Builder ㉙ P3 |
| Settings | Profile ㉚ Terms ㉛ Audit ㉜ ✅P0 · Users & Roles ㉝ ✅P2 · Permissions Matrix ㊷ ✅P2 · Duties ㊻ ✅P2 · Integrations ㉟ ✅P2 · Vault ㉞ P3 |
| §6.5 flanks | retention P1 · media consent P2 · switching import P2 · multi-school P3 (parked) · offline ✅P3 · alumni ✅P3 · AI assists ✅P3 · pocket money & laundry ✅P3 · sales artifacts — parked by owner |
| My Section ㊸a | ✅ shipped — conditional tab on the teacher dashboard (Register/Kit/Money/Events) |

**Result: 47/47 covered — nothing in the blueprint is unqueued.**

---

## The rule

One slice = migration + queries + endpoints + screen + nav + gates + preview
verify. A slice that can't ship in one sitting gets split until it can.
This file is updated **every time a checkbox changes** — it is the honest map.
