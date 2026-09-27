# Master Checklist — everything to build, to 100%

> The complete ledger. Derived line-by-line from `ADMIN-BLUEPRINT.md` (§2
> specs, §6.1 tables, §6.3 platform gaps, §6.5 flanks), `CURRICULUM-ARCHITECTURE.md`
> §4, `ADMIN-DASHBOARD.md` (the laws) and `FEE-REALITY-CHECK.md`.
> `BUILD-PHASES.md` stays the short queue; **this** is the full enumeration.
> Update a checkbox the moment its work lands — this file is the honest map.

---

## What "100%" means (the finish line)

1. Every checkbox below is `[x]` and every gate has passed.
2. One real school can run a **full term end-to-end in the product**:
   enrol (③ + CSV) → bill (⑫⑬) → collect (⑧⑨, manual-first) → assess
   (teacher) → approve → report cards (⑱) → board pack (㊶) — with no
   spreadsheet, no WhatsApp group, and no logbook doing the job instead.
3. All seven **platform gaps (§6.3)** are closed — they decide the sale.
4. Every surface obeys the laws: manual-first money · audit everything ·
   no hardcoding (curriculum-adaptive, duty-driven, matrix-shaped) ·
   forms per `FORM-NAV-STANDARDS.md` · calm IA (47 features → 25 entries) ·
   the two-leaders boundary enforced as data.

**Standard gates per slice:** typecheck (web + api) · RLS behavioral suite ·
`pnpm --filter @mandela/api migrate` after new migrations · module-harness
checks · browser pass as `admin@demo.mandela.school` · preview verified ·
no hardcoded strings (`grep` sweep).

Status legend: `[x]` done · `[ ]` queued · (🔮) parked past Phase 3.

**Status at 2026-09-22:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ (incl. flank
breadth pass) · Phase 3 in progress — ⑥⑲⑮㊳ done, ㊵㉙㉞ + flanks open.
The remaining open items across all phases are exactly the unchecked
`[ ]` lines below — nothing else exists.

---

## Phase 0 — Foundations ✅ (done)

- [x] Tenancy + provisioner + checksummed migrations 001–015 (31 tables)
- [x] RLS behavioral suite + module harness
- [x] Design system `@mandela/ui` (COINEST skin: sage/pine/lime, Poppins),
      Motion primitives, hover tooltips, CountUp/live charts
- [x] Admin Today pulse — live charts, search, bell, profile menu
- [x] People: ① Staff Register · ② Learners · ④ Guardians & Parents ·
      ⑤ Exam Entries
- [x] Money: ⑧ Collect · ⑨ Confirm · ⑩ Levies · ⑪ Fee Reports
- [x] Settings: ㉚ School Profile · ㉛ Terms & Calendar · ㉜ Audit Trail
- [x] Curriculum packs 008–010 (CBE / 8-4-4 / British) + RLS
- [x] Sub-module screens pattern: independent screens with own cards/forms/
      charts; uniform style; sticky non-scrolling sidebar nav

---

## Phase 1 — Money & Compliance term ✅ COMPLETE (admin deepened)

### ⑫ Fee Structures
- [x] Migration 016: `sibling_discount` + `instalment_plan`/`instalment` + RLS + indexes
- [x] Queries: list w/ stats, upsert, bulk-apply assist (audited, dedupe-guarded), discount CRUD, plan CRUD
- [x] Endpoints `admin/fees/*` (zod, money-role floor)
- [x] Screen `/app/money/fees`: KPIs, structures table + Apply assist,
      discount rules, instalment plans, three forms — verified live
- [x] Fee-item consent flag surfaced (2026-09-22): per-item "Require consent / Make automatic" toggle with write-through + consent desk card ("Optional levies · billed after consent") — verified live on /app/money/fees
- [x] Discount leakage card: "Discount rules" KPI live (count + active state); the %-of-billings view sharpens with real discount transaction data
- [x] Avg-fee-per-learner card wired to live data (billed ÷ learners billed)

### ⑬ Invoices & Statements — ✅ core built & verified (2026-09-12)
- [x] No migration needed — ⑬ is the allocation-backed layer over `fee_item` +
      `payments`/`payment_allocation`; consent semantics mirror `v_fee_balance`
- [x] Manual invoice entry — bursar keys fee items × learner × term (law #9);
      audited `invoice.item.create`; refuses duplicates loudly, never silently
- [x] Bulk-apply assist ships in ⑫ (audited, dedupe-guarded) — no dependency
- [x] Per-learner term statement (billed − paid = balance, FIFO waterfall,
      consent-aware) — **same query function for staff AND guardian endpoints**
      (`/web/admin/invoices/statement/:id` and `/web/guardian/statement/:id`
      both call `learnerTermStatement` — the trust fix, by construction)
- [x] Printable statement sheet: school letterhead from `school_settings`,
      stable invoice no (`INV-###/YY-T`), print-only CSS layout, overpayment
      shown honestly as credit
- [x] **Fee statement print view** — `/print/statement/:learnerId` (A4, outside
      the app shell): same `learnerTermStatement` payload (ONE ledger, ONE
      math), full payment history, honest credit line. API
      `GET /web/print/statement/:learnerId` reuses THE statement query —
      guardian own-child enforcement rides the same function. Deep-links:
      statement sheet ("A4 print page"), Learner 360 — *verified live:
      Amina's statement — items match totals, 12 payments, overpayment
      Ksh 6,387 carried honestly*
- [x] **CRUD completion pass (2026-09-22)** — every roster answers "what do I
      do here": Learners Add (auto ADM) / Edit / search / status toggle ·
      Guardians Edit + toggle · Exam Entries per-learner KEMIS fix · Events
      Edit + Cancel · Transport route on/off — all audited, all verified live
      (caught + fixed `updateEvent` placeholder-bind bug en route)
- [x] Cards: billed this term · collected vs billed · outstanding (chase list,
      biggest first) · % cleared
- [ ] SMS/WhatsApp receipt on confirm (lands with the Talk worker, Phase 2)
- [ ] PDF server-render (browser print works today; headless PDF when the
      worker lands)

### ③ Admissions & Enrolment
- [x] Migration: `admission_inquiry` (stage, source, child/guardian snapshot, learner_id) — **017** (+ RLS: all staff read, desk roles write; learner/class INSERT/UPDATE policies)
- [x] Funnel board: Inquiry → Visit → Assessment → Offered → Enrolled (+ Lost), stage moves audited (`admission.stage.move`)
- [x] New-inquiry form (child, parent, phone-that-links-the-family, level, curriculum, source, follow-up) — phone validated `254XXXXXXXXX`
- [x] On enrolment: auto admission-no (ADM-xxx minted from max+1) + learner row + **sibling auto-link by phone** — verified live (Davis Otieno → ADM-007, Grace Otieno linked by 254733000001; audit `admission.convert`)
- [x] Cards: inquiries this term · conversion % (live); next-term projection = basic counts (trend sharpens with data)
- [x] Charts: funnel conversion bars · source-mix donut · 6-month enrolment trend line — verified live (18 chart nodes rendering)

### ㉘ Compliance Center
- [x] One screen: KEMIS candidate registration (from ⑤) · TSC registration
      coverage (from ①) · county licence checklist — migration 018 (`compliance_line`, RLS), live rollup over `kemisReadiness()`
- [x] Cards per line: % ready · deadline countdown chips (green >30d / amber 7–30 / red ≤7d / overdue) · "fix" deep-links into Exam Entries / Staff / Settings — verified live (floor 0%, KEMIS 25% + "Fix 7 learner records →", licence done-toggle audit `compliance.line.update`)
- [x] CSV export (client-side, one click)

### ⑯ Curriculum Setup
- [x] UI over packs 008–010: enable/disable curricula (class-count guard), school default, attach classes to ladders (`class.level_id`), grading scales as data — audit `curriculum.pack.set` / `curriculum.class.attach`
- [x] Cards: packs enabled · classes on a ladder · not attached (warn) · areas in use
- [x] `curriculumContext()` resolver — ONE join (class→level→curriculum→scheme→areas) returning vocab+flags+scale+area-tree; flags computed from pack data, never curriculum-code ifs — verified live (CBE: Learner/Grade/Learning Area/Strands, BE–AE–ME–EE; 8-4-4: Student/Form/Subject, marks 0–100)
- [ ] Dual-curve fixture on the assessment form — the resolver is exposed; wiring capture forms to it lands with ⑰/⑱ (Phase 2)

### Platform (Phase-1 slice)
- [x] **㊲-parked decision: data retention & backups policy page** (flank #8) —
      audit kept forever (the tamper-evident spine), backup regime + export window documented and editable in Settings — verified live ("Policy recorded", audit `settings.retention.set`)

---

## Phase 2 — Operations term

### ㊱ Approvals Inbox + ㊲ Tasks & Follow-ups
- [x] Migration: `approval_request` (type, requester, payload JSON, decision, reason) + `admin_task` (source module, due, state) — **019**, typed enums + RLS
- [x] Approve/reject with **mandatory reason** → audited (+ notifies requester via Talk when the worker lands) — self-decision blocked, role floor admin/principal — verified live (admin raises → principal approves with reason)
- [x] Cards: pending · oldest waiting · Tasks: open · overdue · done this week (completion trend chart with more data; Today pulse now carries the "Needs you today" governance card)
- [ ] Any module can emit a task: defaulters (⑪), term-closing checklist, board actions (㊶), duty rosters (flank #6) — **licence (㉘), KEMIS (⑤) and payroll statutory (⑦: PAYE 9th · SHIF/housing ≤9 working days · NSSF) already seed tasks automatically** (verified in admin_task)

### ⑦ Payroll (core built — Phase 2 remainder below)
- [x] Migration: `staff_contract` · `statutory_rates` (versioned, seeded by us yearly — not school-editable) · `payroll_run` (draft→computed→approved→disbursed) · `payslip` + `payslip_deduction` — **+ 021 fix: payslip INSERT RLS policy + cents-normalized PAYE bands/relief guard**
- [x] Three-population logic: TSC-seconded rows **skipped with recorded reason** (shown on screen, never computed); contract-required for the rest; term-contract population (termly ÷ 3)
- [x] Run computes: allowances → gross → PAYE (bands 10–35% + relief 2,400/mo) → SHIF 2.75% min 300 → Housing 1.5% → NSSF tier caps → net — **verified live: 35,000 → 2,253.33/962.50/525/2,100 → 29,159.17, gross−deductions=net exact**
- [x] **Admin approves with mandatory reason** (zod min 4, controller admin-only) → payslips lock; disbursement stamps the run (bank bulk-upload CSV download · manual · M-Pesa)
- [ ] Disbursement reconciliation recording (per-staff confirmation against bank statement)
- [ ] Payslips by phone (Talk channel, self-pay RLS: own payslip only — **policy `payslip_self_read` already exists**)
- [x] Statutory remittance checklist auto-lands in Tasks ㊲ (PAYE 9th, SHIF/housing ≤9 working days, NSSF) — verified live on /app/people/payroll ("act now" chips) and in admin_task
- [ ] Leave proration (⑥ exists since 025 — proration math still open)
- [x] Cards: salaries due **vs collected** (Ksh 35,000 vs 54,887 · 36% headroom live) · run state · chart: payroll cost vs collections, 6 months
- [x] CSV export seam (bulk-upload format; Solva/Workpay/Sage mapping on demand)

### ⑭ Money Rails — assist layer, never a replacement (core built)
- [ ] Daraja C2B callback → `mpesa_txn` → **suggested pre-filled entry the bursar confirms in one tap** (not silent auto-confirm); STK push later 🔮 — *rails_match.source='daraja-c2b' path + schema live; callback endpoint awaits platform credentials*
- [x] Bank statement CSV import with match-suggestions — *paste/CSV rows → suggestions; engine: admission-no-in-reference 1.000 / name-fragment 0.600 / unmatched; verified live (exact match pre-selected, guess flagged, unmatched Confirm-disabled); confirm → real payments row + audit*
- [x] Cards: auto-matched % · unmatched queue · **manual-entry share kept honestly visible**

### ⑰ Attendance Oversight + ⑱ Exams & Report Cards (built)
- [x] ⑰: today % · 7-day trend · **chronic-absentee list with contact action** · per-class compare bars (read-only; corrections stay teacher-side, audited) — *verified live: Felix 60% absent, Grade 7 Blue 75%*
- [x] ⑱: capture-coverage meter · approval queue (principal approves; admin sees state) · **report-card generation** per learner (scores + attendance + remark from scheme pack — curriculum-adaptive renderer) — *verified live: 0% → 57% w/ seeded assessments; card payload carries CBE vocab + scale from the resolver; generate→approve audited*
- [x] **Guardian-facing report card print view** — `/print/report-card` (A4, outside the app shell): letterhead from school_settings, the pack's own vocabulary + scale from the card payload, attendance, signature band. API `GET /web/print/report-card` — staff any card; **guardians own-child + approved-only (a draft never leaves the building)**. Deep-links: approval queue ("Print preview"), Learner 360 — *verified live: Amina's approved card renders BE–AE–ME–EE + LEARNING AREA from the CBE pack*

### ㉝ Users & Roles + ㊷ Permissions Matrix + ㊻ Duties & Appointments + ㉟ Integrations (built)
- [x] Migration: `staff_duty` (staff, duty, scope, appointed_by, dates, audited) — *plus perm_matrix, integration_health, report_card, bank_csv_import, rails_match (022)*
- [x] ㉝: role change with before/after audit + last-active-admin guard — *invite/magic-link, session list, force-sign-out wait for better-auth*
- [x] ㊷: matrix as **data** — module × role ownership, landing tab per role, who's prompted to act; seeded with two-leaders defaults; hardcoded role checks stay as the security floor — *admin-editable in UI; driving nav visibility is the next step*
- [x] ㊻: the hat registry (deputy, discipline master, G&C, HOD, exams officer, class-teacher-of, patron-of, librarian, dorm-parent-of) — verified live: appointed Discipline Master · Upper Primary, audit `duty.assign`, multi-hat load counter; **conditional surfaces reading their "who" from here lands with Sections ㊸**
- [x] ㉟: connection health for WhatsApp/SMS/M-Pesa/email; secrets stay platform-side (admin toggles, audited)

### ㊸ Sections & Patrons + ㊸a My Section (the school-activities engine)
- [x] Migration 023: `section` (kind, head_staff_id, enabled) · `section_member` (retire, never delete) · `section_session` + `section_session_mark` — *visitor_log stays with Security special case (Phase 3)*
- [x] Section register: all 12 kinds; patron appointment audited (before/after) and auto-writes the `patron-of:<id>` hat to staff_duty — verified live (Science Lab · Test Teacher)
- [x] Capabilities live: **Kit** (stock_item.section_id tag + value rollup) · **Register** (members + session roll-call, held live 1/1 present) · **Events** (sections create school_event rows — same calendar) · **Money** (levies ride ⑩, wiring lands with Spending 🔮)
- [x] Named special cases (2026-09-22): **Security** desk live (sign-in → numbered gate pass GP-#### → check-out; the visitor book is the county-inspector record) · **Mess** live (weekly menu board + per-meal head-count ledger, "never overwritten, only superseded"; auto stock-draw deduction stays open) · **Infirmary** screen (health events, DPA-strict; medication charting = depth 🔮)
- [x] ㊸a patron surface: conditional **My Section** tab on the class (teacher) dashboard — Register / Kit / Money (read-only, deliberately) / Events, with section switcher for multi-hat patrons
- [x] RLS: patron writes members/sessions/marks only where `section.head_staff_id = current staff` (EXISTS policy); admin/principal all — *bursar levy-status view lands with the Money capability*
- [x] Pulse gains **Sections** vital sign (events this week · kit low-stock) — live on AdminPulse

### ㊹ Discipline & Merits + ㊺ Counselling (Conduct & Welfare — one screen, two tabs)
- [x] Migration 023: `discipline_incident` (learner, class, kind merit/demerit, category, points, action, recorded_by, parent_notified_at) · `counselling_case` (confidential, jsonb notes)
- [x] ㊹: incident form + register + by-class breakdown; parent notifications (verified live: merit recorded, notified, audited); ladder floor in RLS (staff write, parents own-child SELECT) — *class-teacher own-class + discipline-master + deputy views refine with the teacher/principal dashboards*
- [x] ㊺: case log (open → note → close/refer, all audited) — **extra-strict RLS proven BOTH ways live: admin sees the count card only; principal ran the full lifecycle**; counts exposed via `counselling_stats()` SECURITY DEFINER so the admin never reads the table
- [x] Incidents by class/type counts + merits vs demerits KPIs on the screen (chart polish feeds the pulse Classroom sign later)

### ㊶ Board & BOM + ㊴ Facilities + ㉓ Hostel + Infirmary
- [x] Migration 024: `board_member` · `board_meeting` · `board_decision` (owner+due, chaseable to ㊲) · `repair_report` (two-tap, verdict computed) · `dorm` + `exeat_pass` · `health_event` (DPA-strict) + RLS + audits
- [x] ㊶ Screen `/app/settings/board`: members/offices/expiry chips, record-meeting with decisions, KPIs — verified live
- [x] ㊴ Screen `/app/operations/facilities`: two-tap report with live repair-vs-replace verdict (<50% rule → "replace", verified), queue, KPIs; term condition walk → board pack line (pack PDF in Phase 3)
- [x] ㉓ Screen `/app/operations/hostel`: dorms, exeat passes; roll-call per bed + damage-to-fee-ledger mapping → Phase 3 depth
- [x] Infirmary screen `/app/operations/infirmary`: health events (DPA-strict RLS), clinic log; medication charting with kit auto-deduct → Phase 3 depth

### ⑳ Transport + ㉑ Library + ㉒ Store screens
- [x] Migration 024: `transport_route` + `bus` + `rider` (⑳); library rides 024 book/copy tables
- [x] ⑳ Screen `/app/operations/transport`: routes/buses/riders, manifests (Driver dashboard = Phase 4); verified E2E via API
- [x] ㉑ Screen `/app/operations/library`: catalog + two-tap issue/return + overdue list; **fines as levies** through Money ⑩ (verified)
- [x] ㉒ Screen `/app/operations/store`: kit issuance via stock tables + low-stock alerts to pulse; movement history (verified)

### ㉔ Events & Calendar + People depth
- [x] Migration 023: `school_event` (title, kind, starts_on, ends_on, audience, notes) with guardian-read RLS
- [x] ㉔: term calendar screen + KPIs (next-7-days, upcoming) + one audited add-event form — verified live (Mid-Term Exams · exam-window); guardian announcement fan-out lands with the Talk worker
- [x] ② Learner 360 — profile page (identity record, guardians, fee ledger = SAME query as ⑬, attendance, conduct, sections); roster rows deep-link in; verified live with real data on all five panels · **bulk CSV import** verified: update-by-admission-no, auto-mint ADM-022, sibling auto-link by phone, per-line error report
- [x] ② class moves with history (2026-09-22): reason-guarded (promotion/transfer require one, correction doesn't), `class_move` ledger, audited — verified live both ways
- [x] ④ relationship editor (edit relationship, set primary, link/unlink with confirm; audited `learner_guardian.update`) — verified live · **[ ] bulk opt-in campaigns feeding Talk — the one open flank** (opt-in flags exist on guardians; the runner doesn't)
- [x] ⑤ per-curriculum candidate numbers: `exam_entry` (exam year, candidate no, status) — KPSEA/KJSEA/KCSE + Cambridge/Edexcel; register + inline candidate-no edit (edit-path UPDATE fixed & audited; KPSEA/2027/0001 live)

### Flank breadth pass — 2026-09-22 (verified live; this file updated to match)

- Fees: consent toggle + consent desk + avg-fee card · Admissions: analytics cards + funnel/donut/trend · Payroll: due-vs-collected dashboard + statutory tasks + CSV seam · Security desk · Mess · Learner 360 class-move history + relationship editor · Exam-entry candidate numbers · My Section patron tab · Purchases pipeline walked to paid
- The only open flank: **bulk opt-in campaigns feeding Talk** (flags exist, runner doesn't)

### Calm-IA fold (§1.5 — done)
- [x] Insights renamed **Reports** (nav_json, both leader roles) · nav children complete (Operations 8, People 6, Settings 5) · capability flags seed + toggle verified E2E (`flag.set` audit) · Sections vital sign on Today pulse

### Platform (Phase-2 slice)
- [ ] **Real login** — better-auth/OTP (dev email-match cannot ship); unlocks ㉝ invites; signup seeds as `admin` (§0.5)
- [ ] **Onboarding wizard** — profile → curriculum pick → terms → fee structure → CSV import (the demo-to-sale converter)
- [ ] **WhatsApp delivery worker** — Talk rows move from `queued` to sent
- [ ] Media & photo consent (flank #7): `media` consent kind per guardian; photos in announcements only for consented guardians
- [ ] Switching import (flank #9): mapping helper for competitor export shapes

---

## Phase 3 — Depth term (🔮)

- [x] ⑥ HR & Leave — DONE (2026-09-22): `staff_leave` + `staff_leave_rules`
      (annual 30/sick 15/maternity 90/paternity 14/compassionate 7 per year),
      raise → decide (two-leaders, mandatory reason, self-decision block),
      out-today, taken-vs-entitlement table; `leave.raise/approve/reject`
      audited. Still open: staff attendance vs teaching days, documents per
      staff, payroll proration feed
- [x] ⑲ Timetable — DONE (2026-09-22): `timetable_slot` (class × day × period
      UNIQUE), week grid with slot dialog (area chips, teacher, room, time),
      teacher-clash guard names the clashing class, soft clear; `timetable.
      upsert/update/clear` audited. Still open: teacher-level week view,
      substitution suggestions
- [x] ⑮ Petty Cash & Budgets — DONE (2026-09-22, migration 026): till top-ups + spends, threshold → approval (Ksh 500 spend pended → approved with reason → balance honest), term budget lines vs spend (kitchen 0/5,000); `petty.record/approve` audited
- [x] ㊳ Purchases & Suppliers — DONE (2026-09-22): supplier register + pipeline draft→submitted→approved→ordered→received→paid, leaders-only approve; **PR-001 (Exercise books, Ksh 14,000) walked every gate live, ended paid**
- [x] ㊵ Co-curricular & Clubs — SHIPPED: activity sections (clubs/teams/arts) on the Sections engine, points houses, consent-gated activity fees through the normal invoice pipeline; Houses & Co-curricular screen live-verified
- [x] ㉙ Report Builder — SHIPPED v1 (2026-09-24): /app/insights/reports — money/attendance/conduct datasets, filter + click-to-sort + CSV export; data floor live-verified against the DB
- [x] ㉞ Documents Vault — SHIPPED: template desk + issued-documents register (certificates/letters with placeholder fill), feeds ㉘ compliance and ⑥ HR
- [x] Alumni (flank #2) — SHIPPED (2026-09-24): /app/people/alumni — mark-graduated form (audited), register with mentor flags; Talk comms ride the normal fanout
- [x] Duty rosters (flank #6) — DONE (2026-09-24, migration 032): "Fold today
      into Tasks" button emits each day's roster slots into ㊲ (idempotent per
      day+slot+assignee, `duty.roster.emit_tasks` audited); roster rows carry
      a live in-tasks pill — verified: emit 1 → re-emit 0
- [x] Houses (flank #1) — DONE (2026-09-24, migration 032): competitions as
      calendar events (kind `house-competition` + house_id FK) with a lean
      create/list desk on the Houses screen; standings stay on house_points
      — no new engine (lean flank position)
- [x] Offline resilience (flank #5) — DONE (2026-09-24, migration 032):
      docs/OFFLINE-CONSTRAINTS.md is the law it implements; only
      attendance.mark queues (localStorage outbox → POST /web/admin/offline/flush,
      client_id uuid replay-proof), money hard-rejected server-side ("money
      never queues — key it online"), SyncBanner shows the explicit state;
      server re-runs semantics, never trusts the client — verified: applied /
      duplicate / money-reject live
- [ ] Multi-school groups (flank #4) — PARKED: needs product decision before build
- [x] AI assists (flank #11) — DONE (2026-09-24, migration 032): **draft-only**
      — one anomaly flag on Today (attendance<30d + fee arrears + demerits/14d
      score, threshold 60) and a plain-language parent-message drafter on
      Insights; every draft recorded in ai_draft + audited (`ai.draft.*`) —
      never auto-send, never auto-decide
- [x] Pocket money & laundry (flank #12) — DONE (2026-09-24, migration 032):
      wallet shipped earlier (028); laundry custody per boarder (out→in with
      bag ref, "still out" answers "where is my sweater") lives on the pocket
      screen; `laundry.out/in` audited — verified: out→1 bag→in→0 live

### Hardening — runs alongside Phase 3 (added 2026-09-24, owner decision)

- [x] Real staff auth — SHIPPED (2026-09-24, migration 031): scrypt password
      digests on staff.login_hash, self-service Set password (audited
      staff.password.set), 5-fails/15-min throttle per ip+email. Dev escape
      keeps demo clickable; production seeds every staff a password.
      Guardian OTP hardening stays open (rate limit already on resend).
- [x] M-Pesa Daraja C2B — SHIPPED (2026-09-24): POST /web/auth/daraja/c2b
      (validation-token guarded, ip-throttled, always-200), replay-proof via
      mpesa_txn UNIQUE, lands a rails_match SUGGESTION the bursar confirms;
      exact-match verified live (ADM-001, score 1.000). Flip
      DARAJA_VALIDATION_TOKEN/SHORTCODE env to go live.
- [x] WhatsApp sender worker — SHIPPED (2026-09-24): provider abstraction
      (talk/providers.ts) — simulate (dev) and Meta Cloud API text send;
      provider_id/provider_note/error recorded per message, outcomes
      audited. Flip WHATSAPP_PROVIDER=meta + token to go live.
- [x] Deployment + backup runbook — SHIPPED: docs/OPS-RUNBOOK.md (env table,
      first deploy, secrets, backups with restore drill) +
      scripts/backup-school.sh (per-school pg_dump, integrity probe,
      rotation). Actual hosting of a server remains an ops action.
- [x] Money-path test suite — SHIPPED: scripts/smoke-money.mjs walks
      record → receipt → statement → collections → report dataset; ALL
      GREEN live (208ms). Run after every deploy.
- [x] IA regroup — 8 mains × 4-5 children — SHIPPED 2026-09-24 (owner-approved):
      migration 030 + seed:branding set the admin map; navModules.tsx carries
      the 38 merged children; TwinLinks rows keep every merged screen one tap
      away; Report Builder slot page live at /app/insights/reports. The map:

      | # | Main | Children (4-5 each) |
      |---|------|---------------------|
      | — | Today (home) | Inbox promoted to the home dashboard (approvals/tasks already live there); no sidebar child |
      | 1 | Money | Collect · Confirm & Rails · Fees, Levies & Pocket · Invoices & Statements · Fee Reports |
      | 2 | Spend | Payroll · Petty Cash & Budgets · Purchases & Suppliers · Store & Kit |
      | 3 | People | Admissions · Learners · Guardians & Parents · Staff Register · HR & Leave |
      | 4 | Academics | Curriculum Setup · Timetable · Attendance Oversight · Exams, Entries & Report Cards · Library |
      | 5 | Operations | Sections & Patrons · Events & Calendar · Duty Rosters · Facilities & Repairs · Transport |
      | 6 | Care | Hostel & Mess · Infirmary & Security · Conduct & Welfare · Houses & Co-curricular · Media Consent |
      | 7 | Insights | Compliance Center · Documents Vault · Audit & Switching · Report Builder (Phase 3 slot) |
      | 8 | Settings | School Profile & Terms · Users & Duties · Board & BOM · Flags & Integrations |

      Merges (47 → 38 children): Confirm+Rails · Fees+Levies+Pocket ·
      Exams+Exam Entries · Hostel+Mess · Infirmary+Security · Profile+Terms ·
      Flags+Integrations · Audit+Switching. Each merge = tabbed page or
      primary-route-with-link; no route deleted. Role tabs (teacher:
      Mark/Class/…, guardian: Pay/Levies/…) come from nav_json and are
      unaffected. Also resolves the two-Payroll split (dashboard in Spend;
      runs editor linked inside).

---

## Other dashboards (after Admin Phase 1–2 stable)

- [ ] **Guardian app** — COINEST re-skin; Home/Pay deep (balances via the **same query** as ⑬); homework/messages polish
- [ ] **Teacher** — Mark/Homework refresh; assessment capture fully curriculum-adaptive; conditional Section tab (㊸a); own-payslip view (⑦)
- [ ] **Principal** — Approve/Insights/Broadcast refresh; department views (HOD), discipline oversight, committee case view, counselling access
- [ ] **Bursar** — inherits Money modules as they land; Reconcile assist ⑭; payroll run + review screens
- [ ] **Counter** — front desk: visitor log, admissions capture, library/store issue, gate passes, exeat logging
- [ ] **Driver** — Route/Manifest/Done (needs ⑳ tables)
- [ ] **Dorm parent / Janitor / Librarian / Patron hats** — all arrive as My-Section/My-Area pattern surfaces, never new role enums

## Platform closing moves

- [ ] Paper-proof exports everywhere: receipts, statements, report cards, board pack, certificates/IDs (flank #3, template-driven)
- [ ] Backups & one-click full data export per school ("your data leaves with you")
- [ ] Performance & scale pass (indexes, pagination, live-bar polling tuning)
- [ ] Security review: RLS suite re-run across every new policy family; audit-log coverage sweep (every write attributable)

---

## Coverage ledger — every blueprint module has a checkbox above

| Group | Modules |
|---|---|
| Today | ㊱㊲ ✅P2 |
| People | ① ✅P0 · ② ✅P0 (+360/CSV/moves ✅P2) · ③ ✅P1 (+analytics ✅P2) · ④ ✅P0 (+editor ✅P2 · campaigns open) · ⑤ ✅P0 (+exam_entry ✅P2) · ⑥ ✅P3 · ⑦ ✅P2 (reconciliation + payslip-phone open) · ㊹ ✅P2 · ㊺ ✅P2 |
| Money | ⑧⑨⑩⑪ ✅P0 · ⑫ ✅P1 (+consent/avg ✅P2) · ⑬ ✅P1 (+SMS/PDF P2) · ⑭ ✅P2 (Daraja callback needs credentials) · ⑮ ✅P3 · ㊳ ✅P3 |
| Academics | ⑯ ✅P1 · ⑰ ✅P2 · ⑱ ✅P2 (+print ✅P2) · ⑲ ✅P3 · ㊵ P3 |
| Operations | ⑳ ✅P2 · ㉑ ✅P2 · ㉒ ✅P2 · ㉓ ✅P2 (+depth2 🔮) · ㉔ ✅P2 · ㊴ ✅P2 · ㊸+㊸a ✅P2 (+Security/Mess ✅P2) |
| Insights | ㉕㉖㉗ ✅P0 · ㉘ ✅P1 · ㊶ ✅P2 · ㉙ P3 |
| Settings | ㉚㉛㉜ ✅P0 · ㉝ ✅P2 · ㊷ ✅P2 · ㊻ ✅P2 · ㉞ P3 · ㉟ ✅P2 |
| Flanks | #1 P3 · #2 P3 · #3 P2–3 · #4 P3 · #5 P3 · #6 P3 · #7 P2 · #8 ✅P1 · #9 P2 · #10 parked (owner) · #11 P3 · #12 P3 |
| Dashboards | Admin P0–2 · Guardian/Teacher/Principal/Bursar/Counter/Driver after Admin stable |

**Nothing in the blueprint is unqueued. This file + `BUILD-PHASES.md` are the
whole contract: a feature ships when its box is `[x]` and its gates are green.**
