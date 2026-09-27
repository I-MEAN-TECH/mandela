# Mandela Admin — The Complete Blueprint

> **The owner's command center.** Every sector of the school — people, money,
> academics, operations, communication, compliance — visible on one pulse and
> manageable through dedicated sub-module screens. This document is the master
> map: what the Admin dashboard **entails**, every module it will carry, and
> the order we build them in.
>
> Supersedes the module map in `docs/ADMIN-DASHBOARD.md` §2.7 and **amends the
> 5-tab rule to 7 nav groups** — an explicit product decision (that doc's own
> escape clause), taken because sub-modules are now independent screens and
> the owner asked for whole-sector coverage, not a checklist trimmed to fit.
>
> Status: ✅ built end-to-end · 🟡 partial (data or UI exists, not both) ·
> ⚪ next — specified here, build queue · 🔮 future — parked with a home.
>
> Product laws every module inherits (from `docs/MODULES.md` and
> `docs/FORM-NAV-STANDARDS.md`): **no hardcoding** (everything from the school
> DB), **3-tap rule**, forms follow the evidence-based standards (one column,
> inline validation, top labels, CSV import for bulk), **integer cents**
> everywhere, **every write audit-logged**, **RLS-gated**, **sub-module =
> its own screen with its own cards, forms and charts** in the COINEST skin.

---

## 0. Market grounding — what "whole-sector" means (2026-09-12, via agent-reach/Exa)

The generic ERP checklist is table stakes; the Kenyan private-school specifics
are where systems win or lose.

**The generic checklist** (every competitor ships a variant of it):

- **Fedena** — 21 core + 17 standard modules: student admission & information,
  timetable, attendance, examinations, gradebook, HR + payroll, finance,
  library, hostel, transport, events calendar, SMS, ID-card generator,
  certificate generator, custom import, news, report center.
- **Saaras.ai** — 27+ modules, 25 role dashboards, pitched as "replace 10+
  tools" (attendance app, fee software, communication tool, LMS, HR system).
- **OpenEduCat** — 74+ modules on Odoo: admission management "inquiry to
  admission", student lifecycle, faculty management, financial management.

**The Kenya-CBC reality** (Intellimis Pro's pitch, aimed exactly at our buyer):

- Up to **30% of fees tied up in arrears** when chasing is manual.
- **Wrong balances in parent portals break trust** — the bursar's ledger and
  the app must show the same number, always.
- **Bursars spend nights reconciling Paybill vs bank slips** — reconciliation
  is the daily grind.
- **CBC assessment paperwork drowns teachers**; report cards must generate.
- **Audit queries** punish manual records; proprietors want audit-ready books.

**Regulatory lines unique to Kenya private schools** (already verified in our
research: `docs/ADMIN-DASHBOARD.md` §0): KEMIS UPI/ULI is mandatory for
national-exam candidates (KPSEA/KJSEA/KCSE), TSC requires private schools to
employ only *registered* teachers (`tsc_no`), and county licence renewal asks
for the same learner/staff data. Data hygiene = exam eligibility + licence.

**The lesson for the blueprint:** ship the full checklist, but order it by the
three numbers the owner actually watches — **fees in, enrolment, compliance** —
and make every module feed one of those three.

---

## 0.5 The two-leaders model — Admin ≠ Principal (2026-09-12, sourced)

The buyer's real org chart: the **owner/director hires a Principal to run
teaching** and runs the business personally or through an administrator.
School-governance literature is explicit — the Principal concentrates on
"educational leadership" while the Business Manager/Administrator takes
"human resources, finance, occupational health and safety, facilities
management and marketing" (schoolgovernance.net.au, on the Principal/Business
Manager relationship in non-government schools). Kenyan proprietor profiles
read identically: directors own "strategic school fees collection systems and
financial management · staff … HR management · payroll processing and
cost control · school adherence to the Education Ministry rules · school
registration" while a hired head teacher runs the academics (LinkedIn,
Kenyan school proprietors/directors, 2026).

**Product consequences (binding):**

1. **The Admin is the system's owner-role, not the Principal's helper.** The
   provisioner currently seeds the signup account as `principal` — wrong for
   this buyer. New schools seed as `admin` (existing tenants keep their rows).
2. **Role boundaries become data, not scattered code.** Each module declares
   an **owner** in the Permissions Matrix (㊷). The `role IN ('admin',
   'principal')` checks stay as the *fallback floor* — a 20-staff school
   wears both hats, so both may act — but the matrix decides nav visibility,
   default landing tab, and who is *prompted* to act. RLS remains the hard
   security line; the matrix only shapes the experience above it.
3. **The boundary table** (owner first; the other role's surface noted):

| Sector | Admin owns | Principal's surface |
|---|---|---|
| Money | everything — fees are the business | read-only dashboards; requests via Approvals ㊱ |
| People / HR | register, contracts, payroll | academic-staff *requests*, performance notes |
| Academics | coverage & compliance views | curriculum, assessment, report cards, timetable |
| Operations | everything (facilities, transport, store) | requests via Approvals ㊱ |
| Talk | operational notices (fees, dates, openings) | academic broadcasts (results, meetings) |
| Compliance | licence, KEMIS, ministry returns | syllabus/assessment quality evidence |
| Insights | board/BOM reporting, trends | classroom analytics |
| Settings | everything | own account only |

---

## 0.6 The staff lattice — hats, not roles (2026-09-12, deep research)

Source of truth: **TSC Career Progression Guidelines** (tsc.go.ke — the
official duties of Deputy Principal/Deputy Head Teacher, Senior Teacher,
HOD…) plus discipline/library software feature sets (MyEncore). The named
hats in a Kenyan school and what they actually do:

| Hat | Real duties (TSC-sourced where noted) | System surface |
|---|---|---|
| **Deputy Principal / Dep. Head Teacher** | discipline oversight + arbitrates disputes; G&C oversight; supervise schemes of work & lesson plans; internal exams; instructional materials; **stores requisition + inventory**; supervise staff; **secretary to staff meetings & the disciplinary committee**; **maintain staff/learner records incl. leave forms**; appraise teachers | oversight cards on Reports; leave/inventory first-line approvals (configurable in ㊷); disciplinary-committee case view ㊹ |
| **Discipline Master** | incident log, demerit/merit system, detention scheduling, parent notification, committee cases | **Conduct tab ㊹** — the discipline engine |
| **Guidance & Counselling teacher** | confidential learner case work (TSC: "provide guidance and counselling services") | **Welfare tab ㊺** — confidential case log, extra-strict RLS |
| **HOD / Senior Teacher** | departmental schemes/lesson-plan checks, appraisals, department coverage | **Department view** (Academics): coverage checklists + appraisal input into ⑥ |
| **Exams Officer** | exam scheduling, marks collection, KNEC liaison, candidate entries | **Exams view**: marks-completion tracker + Exam Entries ⑤ |
| **Class teacher** | pastoral care, first-line discipline, own class records | existing Class tab + their class's conduct records ㊹ |
| **Patron** | runs a section (lab/sports/drama…) | My Section ㊸a |
| **Librarian** | cataloguing, issue/return, overdue chase, stock-taking | **Library counter ㉑** — the My-Section pattern |
| **Janitor / Caretaker** | walks areas; **reports and documents broken desks, chairs, lockers, fixtures** (photo + room + note); sees own reports' status | **My Area reporting view** (㊴) — file-and-track, the simplest surface in the product |
| **Dorm parent / Matron** | roll-call, welfare, boarding head-counts | **Hostel desk ㉓** when enabled |

**The design law — duties, not role enums:** `user_role` stays six values;
the lattice is a **`staff_duty` table** (staff, duty kind, scope: a class /
department / section / house / school-wide, appointed_by, dates — audited,
appointed by the principal or admin). One teacher wears many hats
(deputy + HOD + class teacher is normal); enums would force fake choices,
duties compose. Every conditional tab/card in the table above reads its
duty from here; ㊻ is the registry screen that manages them.

---

## 0.7 The competition gap — what nobody has done (synthesis, 2026-09-12)

Everything across this document's research, in one table — the reason to
believe. "They" = Fedena/Saaras/OpenEduCat (module sprawl), Drishti/iAdmin
(per-activity silos), board portals, SchoolXP's own post mortem on why staff
hate ERPs ("designed by IT programmers for IT programmers… staff spend more
time managing the system than supporting students"), Intellimis's trust
complaints ("wrong balances in parent apps").

| Nobody does… | Mandela's answer |
|---|---|
| One pattern for the school's long tail of activities (15 silo modules instead) | Sections engine ㊸ — activities as rows, four shared capabilities |
| The staff-lattice as roles (deputy/discipline/G&C forced into enums or ignored) | Hats as `staff_duty` rows — TSC-aligned, composing (§0.6) |
| The admin↔principal boundary as a product structure | Two-leaders model §0.5 + Approvals Inbox ㊱ + Permissions Matrix ㊷ |
| Curriculum as a per-school toggle (or one national curriculum, hardcoded) | Curriculum-as-configuration, per class, adaptive forms/vocab/reports (CURRICULUM-ARCHITECTURE §4) |
| Money that is either manual-hostile or rail-dependent | Manual-first law + rails as honest assists (⑧⑭) |
| Boards as enterprise portal logins | Paper-first Board & BOM ㊶ — the board reads, doesn't log in |
| Implementation reality (300 paper learners, switching from a rival) | CSV import everywhere + onboarding wizard + switching import (§6.3, §6.5 #9) |
| The bursar-on-a-Tuesday test (plain words, calm nav, 3 taps) | The laws §1.5 + FORM-NAV-STANDARDS — simplicity as architecture, not skin |
| Balances the parent can trust | Same-query trust fix ⑬ — portal and ledger render one query |
| Compliance as one glance (KEMIS/TSC/licence scattered in spreadsheets) | Exam Entries ⑤ + Compliance Center ㉘ with countdowns |
| **Nobody treats boarding as part of the school** (separate hostel software, separate ledger) | Hostel ㉓: same learner, same fee ledger, beds as assets, damage bills to the right student automatically |

**The positioning line: competitors sell modules; Mandela sells a school
that runs.** The wedge (§6.4) is the three numbers; the moat is this table.

---

## 1. Information architecture — 7 nav groups, 47 modules

`nav_json` drives the top level; children are independent screens. Seven
groups, **47 numbered modules** — the complete set the two-leaders model
assigns to the Admin (§0.5), every one a standalone screen with its own
cards, forms and charts.

| Group | Sub-modules (status) |
|---|---|
| **Today** | The Pulse ✅ · Approvals Inbox ㊱ ⚪ · Tasks & Follow-ups ㊲ ⚪ · Quick actions ✅ |
| **People** | Staff Register ① ✅ · Learners ② ✅ · Admissions ③ ⚪ · Guardians & Parents ④ ✅ · Exam Entries ⑤ ✅ · **Discipline & Merits ㊹ ⚪** · **Guidance & Counselling ㊺ ⚪** · HR & Leave ⑥ 🔮 · **Payroll ⑦ ⚪** |
| **Money** | Collect ⑧ ✅ · Confirm ⑨ ✅ · Levies ⑩ ✅ · Fee Reports ⑪ ✅ · Fee Structures ⑫ ⚪ · Invoices & Statements ⑬ ⚪ · Money Rails ⑭ ⚪ · Petty Cash & Budgets ⑮ 🔮 · Purchases & Suppliers ㊳ 🔮 |
| **Academics** | Curriculum Setup ⑯ 🟡 · Attendance Oversight ⑰ ⚪ · Exams & Report Cards ⑱ ⚪ · Timetable ⑲ 🔮 · Co-curricular ㊵ 🔮 |
| **Operations** | Transport ⑳ 🟡 · Library ㉑ 🟡 · Store ㉒ 🟡 · Hostel ㉓ 🔮 · Events & Calendar ㉔ ⚪ · **Facilities & Maintenance ㊴ ⚪** |
| **Insights** | Collections ㉕ ✅ · Attendance ㉖ ✅ · Parent Reach ㉗ ✅ · Compliance Center ㉘ ⚪ · **Board & BOM ㊶ ⚪** · Report Builder ㉙ 🔮 |
| **Settings** | School Profile ㉚ ✅ · Terms & Calendar ㉛ ✅ · Users & Roles ㉝ ⚪ · Permissions Matrix ㊷ ⚪ · **Duties & Appointments ㊻ ⚪** · Audit Trail ㉜ ✅ · Documents Vault ㉞ 🔮 · Integrations ㉟ ⚪ |

Legend: 🟡 = tables/schema exist with RLS, screens or depth missing.

---

---

## 1.5 Calm IA — 25 nav entries, 100% of the features (2026-09-12)

> Evidence: NN/g menu-design checklist (2024) — "use clear, specific, and
> familiar wording… menus are not the place to get cute with made-up words,
> internal jargon, or **abstract high-level categorization**"; progressive
> disclosure — show what's needed, nest the advanced; and NN/g's "how many
> items in a nav menu" — the count is decided by scannability factors, not
> the mythical 7. Competitor manuals (sKoolERP, Xrero) confirm the plain
> naming style school staff already know: Finance, Academic, Transport,
> Admissions, Students.

§1 stays the **feature registry** (47 modules — nothing is removed). This
section is the **nav map**: what the sidebar actually shows. Two moves get
42 features into a calm menu:

**Move 1 — merge by admin job, not by object.** One screen per job; merged
features live as **tabs inside the screen** (still one screen, own cards,
forms and charts — the screen just has an internal tab strip).

**Move 2 — progressive disclosure via capability flags.** Every desk carries
an `enabled` flag set at onboarding (wizard) and toggleable in Settings.
**Nav shows only what the school uses** — a school without buses never sees
Transport; a school without a library never sees Library. Tables, APIs and
RLS exist regardless (the no-hardcode law holds); the menu just stays quiet.
Day-one nav shows ~16 entries for a typical school, growing only as the
school grows.

| Group | Nav children (tabs inside where noted) | Holds |
|---|---|---|
| **Today** | Pulse (home) · **Inbox** *(tabs: Approvals ㊱ · Tasks ㊲)* · **Calendar** ㉔ | 4 → 3 |
| **People** | **Staff & HR** *(tabs: Register ① · Leave ⑥ 🔮 · Payroll ⑦)* · **Learners** *(tabs: Roster ② · Admissions ③)* · Guardians & Parents ④ · Exam Entries ⑤ · **Conduct & Welfare** *(tabs: Discipline ㊹ · Counselling ㊺)* | 9 → 5 |
| **Money** | **Collect** *(tabs: Record ⑧ · Confirm ⑨ · Auto-rails ⑭)* · **Fees** *(tabs: Structures ⑫ · Levies ⑩)* · **Statements & Reports** *(tabs: Invoices/Statements ⑬ · Fee Reports ⑪)* · **Spending** 🔮 *(tabs: Petty cash ⑮ · Purchases ㊳)* | 9 → 4 |
| **Academics** | **Academic Setup** *(tabs: Curriculum ⑯ · Timetable ⑲ 🔮 · Co-curricular ㊵ 🔮)* · **Classroom** *(tabs: Attendance ⑰ · Exams & Report Cards ⑱)* | 5 → 2 |
| **Operations** *(all conditional)* | Transport ⑳ · Library ㉑ · Store ㉒ · Hostel ㉓ 🔮 · **Sections & Patrons ㊸** · **Facilities ㊴** *(anyone reports; janitor's My Area)* | 7 → 6 (hidden until enabled) |
| **Insights** | **Reports** *(tabs: Collections ㉕ · Attendance ㉖ · Parent Reach ㉗)* · Compliance Center ㉘ · **Board & BOM ㊶** *(tabs: Pack · Meetings · Members · Actions)* · Report Builder ㉙ 🔮 | 6 → 3 |
| **Settings** | School Profile ㉚ *(tabs: Identity · Connections ㉟)* · Terms & Calendar ㉛ · **Users & Access** *(tabs: Users ㉝ · Permissions Matrix ㊷ · Duties ㊻)* · Audit Trail ㉜ · Documents Vault ㉞ 🔮 | 8 → 5 |

**Total: 47 modules → 28 nav entries (≈17 visible on day one). Every feature
keeps its spec, its number, and its build slot — only the menu folds them.**

### Group names — researched (NN/g: plain, familiar, front-loaded)

| Group | Verdict from research |
|---|---|
| **Today** | Keep — the universal home-tab convention, warm and concrete |
| **People** | Keep — plain language for staff+learners+guardians in one word |
| **Money** | Keep — plainer than "Finance"; it's the word owners use for fees |
| **Academics** | Keep — sKoolERP's own "Academic" label; school staff know it |
| **Operations** | ✅ **Decided (2026-09-12): keep Operations** — owner's call; familiar from ERP land |
| **Insights** | ✅ **Decided (2026-09-12): rename to Reports** — plainer and front-loaded; Compliance Center lives there as a child, not the group name |
| **Settings** | Keep — universal |

Renames land as data (`nav_json` seeds + `NAV_CHILDREN` keys), one migration
plus one map edit — no page rewrites. **Not yet applied to code — owner said
wait.**

---

## 2. Module specifications

Each module states: what it is and the market line behind it, its **cards**
(KPIs), **forms** (writes), **tables/charts** (reads), and its data + gates.
All writes audit-logged; all reads RLS-scoped to admin/principal unless noted;
**ownership** per the §0.5 boundary table, enforced as data via ㊷.

### Today

**㊱ Approvals Inbox — ⚪ next · NEW**
The two-leaders model's hinge: every request needing the owner's sign-off in
one queue — the principal's purchase or academic-staff requests, bursar
write-offs/fee waivers, staff leave (⑥), route additions (⑳). Cards: pending
count, oldest waiting, by-type mix. Actions: approve/reject with a mandatory
reason → audited + notifies the requester. Table: type, requester, amount
where money, age. Data: `approval_request` (§6.1).

**㊲ Tasks & Follow-ups — ⚪ next · NEW**
The admin's operating rhythm, auto-generated from the system: chase a
defaulter (from ⑪'s list), renew the licence (㉘ countdown), close KEMIS
gaps (⑤), run the term-closing checklist — plus manual tasks. Any module can
emit a task. Cards: open, overdue, done this week. Chart: completion trend.

### People

**① Staff Register — ✅ built**
The register: name, role, contacts, TSC no, National ID, classes, status.
Cards: active staff, teachers, leadership, ID coverage with warn chips.
Form: Add staff (audit-logged). Table with Deactivate/reactivate.
*Depth next:* staff documents (contract, TSC certificate) via the vault 🔮.

**② Learners — ✅ built, depth next**
Roster by class with gender/status KPIs; classes card with seat counts.
*Next (⚪):* **Learner 360** (profile: guardians, fee balance, attendance
history in one place), **class moves with history**, **bulk CSV import** —
the market's answer to "records live in spreadsheets" and the demo's smallness.

**③ Admissions & Enrolment — ⚪ next · NEW**
Market: OpenEduCat sells admission as "inquiry to admission"; for a private
school the funnel *is* the growth engine. Cards: inquiries this term,
conversion rate %, next-term enrolment projection. **Funnel board:**
Inquiry → School tour → Interview → Offer → Admitted (kanban columns from the
DB, move = audited). Form: new inquiry (child name, DOB, curriculum level,
guardian contact, source). On "Admitted": auto-generate admission no, create
learner + guardian rows, auto-link siblings by phone (fee reality: siblings
share payers). Charts: funnel conversion bar, source mix donut, enrolment
trend line. Tables: `admission_inquiry` (new), joins to `learner`.

**④ Guardians & Parents — ✅ built**
Contact book: phone, relationship, children resolved through
`learner_guardian`, WhatsApp opt-in chips, CSV import/export.
*Depth next:* relationship editor (add/remove links with audit), bulk opt-in
campaign rows feeding Talk.

**⑤ Exam Entries (KEMIS readiness) — ✅ built**
UPI/birth-cert/guardian/staff-ID completeness KPIs, gap list, CSV export.
*Depth next:* **per-curriculum candidate numbers** — KPSEA/KJSEA/KCSE
registration status per candidate (data model: `exam_entry` table ⚪ with
exam year + candidate no + status), and Cambridge/Edexcel equivalents from
the curriculum packs (008–010).

**⑥ HR & Leave — 🔮 future**
Leave ledger (annual/sick/maternity per BOM contracts), staff attendance
vs teaching days, documents per staff. Home: People tab, own screen.
Tables: `staff_leave` (new). Cards: on-leave today, days taken vs entitlement.
Reversal trigger from the original boundary: buyer interviews say "we'd
switch for payroll/HR".

**㊹ Discipline & Merits — ⚪ next · NEW**
The merit/demerit engine (market-verified: MyEncore "merit/demerit tracking,
detention & consequence scheduling, behavior reports to parents"). Tables:
`discipline_incident` (learner, class, type, merit/demerit points, action,
recorded_by, parent_notified_at). Access ladder: class teacher records own
class; discipline master manages all; deputy sees oversight + the
disciplinary-committee case view; parents see their child's record only.
Cards: incidents this term, merits vs demerits, detentions scheduled.
Chart: incidents by class/type. This module feeds the pulse's Classroom
vital sign and the deputy's oversight card.

**㊺ Guidance & Counselling — ⚪ next · NEW**
Confidential case log for the G&C teacher: case notes, referrals,
follow-ups. **Extra-strict RLS** — readable only by the duty-holder and the
principal; notably *not* the admin (Kenya DPA-sensitive pastoral data); the
admin sees only a count card, never case contents. Separated from ㊹ by
design: discipline is administrative, counselling is therapeutic — mixing
them is how competitors lose schools' trust.

**⑦ Payroll — ⚪ promoted from 🔮 (owner request 2026-09-12; reversal trigger
fired). Full spec — research: KRA PAYE bands 10→35% + personal relief 2,400/mo,
Housing Levy 1.5%+1.5% (remit ≤9 working days), SHIF, NSSF tiers, NITA 5+
staff — all rates change yearly, so they live as versioned data, never code.**

The Kenya private-school reality (Lipana/AWRA research) — **three staff
populations, one system:**

| Population | On register ①? | In the payroll run? |
|---|---|---|
| TSC-seconded teachers (state-paid) | Yes | **No** — skipped with reason |
| BOM/board-employed teachers + support staff | Yes | Yes — contract required |
| Term-contract staff (matron, games coach, casuals) | Yes | Yes — term-aligned contracts |

**Data:** `staff_contract` (staff, basic cents, frequency, allowances jsonb,
effective dates, active — no active contract = run skips + records why);
`statutory_rates` (period, kind, params jsonb, source) — **seeded & versioned
by us per year, like curriculum packs; not school-editable** (the legal
fix); `payroll_run` (period, state draft→computed→approved→disbursed→filed);
`payslip` (computed lines: basic prorated over working days less approved
unpaid leave ⑥, allowances, gross, taxable, PAYE, SHIF, housing, NSSF, net);
`payslip_deduction` (HELB, advances, welfare).

**The flow (manual-first law applies):** open the run → system computes
active contracts (TSC rows skipped + listed) → bursar reviews drafts,
adjusts allowances/deductions (audited) → **admin approves via Approvals
Inbox ㊱** → payslips lock → **disbursement: bank bulk-upload file (assist)
or manual per-staff transfer recording** — the school pays however it pays;
the system records → **payslips reach each staff member's phone privately**
(Talk channel, self-pay RLS: own payslip only) → statutory remittance
checklist (PAYE/SHIF/housing/NSSF deadlines) auto-lands in Tasks ㊲ with
countdowns.

**Boundaries kept:** the CSV export seam to Solva/Workpay/Sage stays for
schools that want it; full double-entry accounting stays excluded. Cards:
salaries due this month · **vs collected** (the pulse's two biggest owner
numbers, landing with this module) · staff paid · TSC rows skipped. Chart:
payroll cost vs collections by month. RLS: admin+bursar full; staff see
own payslips; teachers see none of others'. Build slot: Phase 2.

### Money**⑧ Collect — ✅ · ⑨ Confirm — ✅ · ⑩ Levies — ✅ · ⑪ Fee Reports — ✅**
The bursar's four live modules, shared with Admin (RLS already grants it).
**Product law (owner, 2026-09-12): money entry is manual-first — the bursar
keys receipt data (learner, method, amount, reference) by hand, always the
primary path.** Rails (⑭) may pre-fill and suggest; they never replace the
hands-on flow or become a dependency. Manual entry is also the fraud story's
answer: every keystroke is attributable and audit-logged.
*Depth next on Reports (⚪):* **defaulter list with contact actions**
(WhatsApp/SMS deep-link per guardian — the 30%-in-arrears number attacked
 directly), **term-end statements per learner** (PDF/print), allocation-backed
statements and sibling discounts once allocations exist.

**⑫ Fee Structures — ⚪ next**
Today structures are seeded-only. This module is the editor: fee items per
class × term (tuition, lunch, activity), optional items behind consent,
**bulk-apply a structure to a whole class in one action**, **sibling
discount rules** (% off per additional child, from `docs/FEE-REALITY-CHECK.md`),
**payment plans** (instalment schedules a balance can be measured against).
Cards: items billed this term, avg fee per learner, discount leakage.
Form: fee item editor (name, class, term, amount cents, optional+consent).
Table: structures by class/term with apply actions.

**⑬ Invoices & Statements — ⚪ next**
Per-learner invoice for the term (billed − paid = balance, allocation-backed),
print/PDF layout, **SMS/WhatsApp receipt on confirm** (receipt numbers are
already data). **The bursar keys invoice data manually** (fee items ×
learner × term; bulk-apply from ⑫ assists); auto-generation is never a
dependency. Cards: invoices issued, % with zero balance. The trust fix:
guardian portal and bursar ledger render *the same query*.

**⑭ Money Rails — ⚪ next · assist layer, never a replacement**
Ready-but-optional accelerators on top of the manual-first law: **M-Pesa
Daraja** (C2B callback → `mpesa_txn` → a *suggested* pre-filled entry the
bursar confirms in one tap — tables exist; STK push later); **bank statement
import** (CSV) with match-suggestions against pending payments. The bursar
always keys data by hand when rails are off (API down, Paybill pending,
power cut) — the system must be fully operable that day. Cards: auto-matched
%, unmatched queue size, manual-entry share (kept honestly visible).

**⑮ Petty Cash & Budgets — 🔮 future**
Petty-cash ledger with approve/reimburse flow; term budget vs actual per
cost center. Needs accountant workflows — park behind Money Rails.

**㊳ Purchases & Suppliers — 🔮 future**
The spending side the owner also runs (Kenyan proprietor reality: cost
control, suppliers): purchase requests raised here or via Approvals ㊱,
supplier ledger, bills recorded against ⑮'s budget lines. Reversal trigger:
a school asks us to replace its supplier spreadsheet.

### Academics *(new group — the Admin's classroom oversight)*

**⑯ Curriculum Setup — 🟡 data exists, UI next**
The curriculum-agnostic core (migrations 008–010): `curriculum`,
`curriculum_level`, `learning_area`, `assessment_scheme` packs for **CBE,
8-4-4, British** — any school, any curriculum. The UI: attach classes to a
ladder (`class.level_id`), view/edit learning areas per level, view grading
scales (BE/AE/ME/EE etc.) as data. Cards: curricula in use, classes unlinked
to a ladder (warn), learning areas per level. Any new curriculum = new
numbered pack, never a code change. **Selecting a curriculum changes the
whole system's forms and flows** — the mechanism is specified in
`docs/CURRICULUM-ARCHITECTURE.md` §4 (curriculum context, adaptive forms,
per-body exam meters).

**⑰ Attendance Oversight — ⚪ next**
Teacher marking writes the data daily; Admin sees the school-wide view:
today %, 7-day trend (exists in Insights), **chronic-absentee list** (learners
below threshold — with a contact action, since absence is a fee-churn
warning), **per-class compare** bars. Read-only here: correction stays with
the teacher, edits audited.

**⑱ Exams & Report Cards — ⚪ next**
Assessment capture is teacher-side; Admin's screen is **coverage +
approval + output**: % of classes with complete assessment records this term
(pulse KPI), approval queue (principal approves, admin sees state), **report
card generation** per learner (scores + attendance + remark from the scheme
pack — the module parents feel most). Cards: capture coverage, report cards
generated, pending approvals.

**⑲ Timetable — 🔮 future**
Period grid per class with teacher-clash detection. Real scheduling is a
hard problem and the last-mile pain is smaller than fees/compliance — park
until Academics ⑯–⑱ are live.

**㊵ Co-curricular & Clubs — 🔮 future**
Sports, clubs, trips: activity register, per-activity fee items (consent-
gated levies through Money ⑩), fixtures calendar feeding ㉔. Split ownership:
the principal runs the program; the admin bills it and moves the logistics.

### Operations *(new group — the physical school)*

**⑳ Transport — 🟡 schema next**
Private schools run their own buses; fees ride as consent-gated optional
levies (Money ⑩). Build: routes, buses, boarding points, per-term manifests
+ the existing Driver role dashboard (Route·Manifest·Done). Cards: routes
running, learners per route, route-fee collection %. Pulse card when tables
land.

**㉑ Library Desk — 🟡 tables exist, no screens**
`library_item`/`library_copy`/`library_loan` with RLS. Counter UI: issue/
return in two taps, overdue list (pulse alert), catalog cards. Low cost —
schema is fully designed. *Depth (research 2026-09-12):* cataloguing with
ISBN/QR scan per copy; borrower limits per level; reservations; fines as
small levies through Money ⑩ (never cash at the desk); term stock-taking
mode; "most-borrowed this term" for the reading culture card. The librarian
sees exactly the patron's My-Section pattern (㊸a) — register, kit (books),
events (book week), money read-only.

**㉒ Store & Inventory — 🟡 tables exist, no screens**
`stock_item`/`stock_movement`. Kit issuance, low-stock threshold alerts to
the pulse, movement history. Uniform/bookstore resale can later bill through
fee items.

**㉓ Hostel & Boarding — ⚪ upgraded from 🔮 (research 2026-09-12: SchoolDeck's
residential playbook, reduced to school-scale)**
Regular ERPs handle 8 AM–3 PM; boarding is the other half of the school's
life. Our version keeps one learner, one ledger — no separate hostel silo:

- **Dorms & beds as assets.** `dorm` (name, gender, capacity) + **beds,
mattresses, trunks, fans are `asset` rows (㊴) whose room is the dorm** —
the janitor's My Area covers dorm furniture exactly like classroom desks.
**Asset-to-student mapping:** `dorm_allocation` assigns a boarder to a bed
each term; when a study lamp or bed board breaks, the repair's cost **flows
to that student's fee ledger through the allocation pattern** — no dispute,
no argument (SchoolDeck's trick, built on our money rails).
- **Exeat / weekend passes** — `exeat_pass` (learner, depart, return, reason,
guardian consent via phone OTP, deputy/warden approval, state). Feeds two
things: the gate log at the counter, and **mess head-count forecasting**
("Saturday dinner: 393 on campus — 47 out till Sunday"), so the kitchen
cooks real numbers.
- **Nightly roll-call** — `hostel_rollcall` (date, dorm, learner, state),
one-tap per bed from the dorm parent's phone (the §0.6 hat). A missing
boarder escalates instantly to the deputy/admin — no biometrics, just the
pattern teachers already trust.
- **Mid-term conversion** — day-scholar ↔ boarder switches billing via the
existing levies (boarding fees are consent-gated items), prorated by term
dates. No new billing machinery.
- **Depth-2 (🔮):** pocket-money wallet per boarder (parent tops up, tuck-shop
spend logged to the parent, cash off campus) and laundry piece-tracking —
both ride on the wallet/kit patterns; not day-one.
- Cards: occupancy per dorm, tonight's head-count, boarders out, damage
charges this term. RLS: dorm parent sees own dorm; admin/deputy all.

**㉔ Events & Calendar — ⚪ next**
Term calendar (Terms & Calendar ✅ owns dates) + school events, exam windows,
open days — feeding guardian announcements and the landing hero. Cards:
events this term, next 7 days. One form: add event (audited).

**㊴ Facilities & Maintenance — ⚪ upgraded with lockers/desks (research 2026-09-12)**
The Business Manager's classic domain (§0.5): asset register, maintenance
schedule, repair-cost history per asset, utilities log — now with the
classroom-furniture core the research calls the most mismanaged asset class
(schools run it reactively: "a broken chair gets reported when a student
sits on it"). The simple version of the industrial pattern:

- **Asset register per room** — desks, chairs, lockers, whiteboards, doors,
  windows: kind, room, condition (good/worn/broken), photo, age, history.
- **Anyone reports, instantly** — teacher or **janitor (the §0.6 My Area
  hat)** files: pick room → item → photo → note. Two taps. Creates a repair
  item in the queue and flags the asset condition. Structural damage marks
  the item out of service (safety first — research: never defer those).
- **Repair-vs-replace rule, as data:** repair if cost < ~50% of replacement
  AND remaining life suffices; structural failure (welds, cracked seats,
  locker frames) → replace regardless. The screen shows the rule's verdict
  per queued item so the admin decides in one glance.
- **Term rhythm** — condition walk per room (janitor, assigned via Tasks
  ㊲), producing the replacement projection line in the **Board Pack ㊶**
  ("desks past threshold: Ksh X — planned, not emergency").
- Cards: open repairs, broken-out-of-service count, cost this term,
  replacement projection. All audited; teacher/janitor write only reports,
  admin/deputy write decisions.

**㊸ Sections & Patrons — ⚪ next · NEW (the non-academic school engine)**

Market (2026-09-12, sourced): Kenyan teachers carry hats like "Drama & Music
Club **Patron**", "**Games master**", "Debate/Journalism Club Patron" — the
principal appoints peer teachers to run sections, several hats per teacher.
Competitors (Drishti, iAdmin) ship each section as a separate silo module
(hostel + canteen + visitor + lab + assets…). We do the opposite: **one
generic engine, sections as rows** — the simplicity edge.

- **A Section is data:** name + kind (`lab · sports · drama · music · club ·
  mess · security · infirmary · library · store · transport`), `enabled`
  flag, **`head_staff_id` = the patron**. The principal appoints the patron
  (audited before/after); the admin sees the register of sections. The
  patron's tools come from the section row — **no new role enum** (a patron
  is still `teacher`; capability, not identity).
- **Every section gets the same four capabilities (no bespoke screens):**
  1. **Kit** — equipment/consumables via the existing stock tables
     (`stock_item`/`stock_movement` tagged to the section): the lab's
     apparatus, sports kit, drama costumes, infirmary supplies
  2. **Money** — section dues/trip fees as consent-gated levies through
     Money ⑩ (music-festival transport, sports kit, trip entries)
  3. **Events** — fixtures/festivals/performances as calendar items (㉔)
     feeding guardian announcements: Drama Festival, music galas, match days
  4. **Register** — member learners + session attendance (who trains when)
- **Named special cases ship with the engine:** **Security** — the
  visitor log + gate passes, written at the front desk by `counter`
  (competitors sell this as a standalone module); **Mess/Canteen** — weekly
  menu, store-linked stock, head-count per meal (prepaid wallet 🔮);
  **Infirmary** — health records per learner (allergies, chronic
  conditions, immunizations — parent-declared at enrolment), clinic-visit
  log (complaint → action → outcome → parent notified), medication doses
  **charted as given** with kit stock auto-deducting (SchoolDoc's EHR
  pattern, reduced to school scale). **DPA-sensitive like counselling ㊺:**
  strict RLS — duty-holder + principal read cases, the admin sees counts
  only; allergy flags surface to the class teacher and dorm parent (who
  need them at 2 AM), never the whole staff.
- Cards: sections enabled, patrons appointed (gaps flagged), kit value per
  section, events this month. Screen: Operations group; the patron gets a
  focused "my section" view; the pulse gains one **Sections** vital sign
  (events this week · kit low-stock count).
- Tables (§6.1): `section` (kind, head_staff_id, enabled), `section_member`,
  `visitor_log`, `section_session` + `section_session_mark` (roll-call per
  session — the attendance pattern, not a copy of the class register).

**㊸a The patron's surface — what changes on the teacher's dashboard**

> Research (2026-09-12, club platforms Paak/Sportia): the coordinator's tool
> is exactly members + one-tap session roll-call + library-style kit
> issue/return with custody history + central payments + parent reminders.
> Nothing more — matching our four capabilities.

**Principle: appointment is additive capability, not a new dashboard.** The
patron keeps their five tabs (Today · Mark · Homework · Messages · Class);
being a patron adds exactly one conditional tab — **Section** — visible only
because their session carries `patron_of` (the capability-flag pattern, same
as desks). No appointment → no tab, zero clutter for everyone else.

The **My Section** screen (one screen, internal tabs, section switcher on
 top for multi-hat patrons — Kenyan teachers commonly hold 2–3 hats):

1. **Register** — member learners (`section_member`), one-tap session
   roll-call from the roster (`section_session` + marks), session history.
2. **Kit** — issue/return with due dates and **custody history per item**
   (the stock tables, movements tagged to the section; overdue kit chases
   itself onto the patron's Today card).
3. **Money — read-only, deliberately.** Section dues/trip fees are levies
   collected by the **bursar** through Money ⑩; the patron sees collection
   status per member and raises requests (new kit, trip budget) through the
   Approvals Inbox ㊱. Registering activity ≠ handling money — the §0.5
   boundary holds inside the staff too.
4. **Events** — fixtures/festivals/performances as calendar items ㉔; the
   patron **composes** the guardian announcement but it flows for approval
   (admin/principal) before sending — no direct broadcast line.

**RLS:** new policy family — teacher reads/writes a section's rows (members,
sessions, kit movements) **only where `section.head_staff_id = current
staff`** (the same GUC pattern as teacher-owns-classes). Admin/principal
see all sections; bursar sees levy status only; the patron can never edit
learner register rows outside their section.

**Today card for the patron:** "🔒 Lab · 24 members · next session Tue ·
2 kit overdue · fixture Friday" — real data, count-ups, deep-links into My
Section. That card is the whole appointment's presence on the morning screen.

### Insights

**㉕ Collections — ✅ · ㉖ Attendance — ✅ · ㉗ Parent Reach — ✅**
Existing screens stay; per-class compare and term-over-term land as second
terms accumulate real data.

**㉘ Compliance Center — ⚪ next**
Every regulatory line on one screen with countdowns: **KEMIS** candidate
registration (from ⑤'s data), **TSC registration coverage** (from ①), county
licence renewal checklist (documents from the vault 🔮). Cards per line:
% ready, deadline countdown chip, "fix" deep-links into the owning module.
This is the module that turns data hygiene from chore into one glance.

**㊶ Board & BOM — ⚪ next · upgraded from pack-only (research 2026-09-12)**

The owner answers to a board/BOM — in private schools the proprietor's own
board (Basic Education Act 2013 Part VIII §§55–63 set the BOM pattern:
chairperson + members with terms, functions incl. budget oversight, the
head serving as **secretary**; private schools' boards under Part VII
§§49–52). Board-portal research (BoardPro: agenda builder, packs,
real-time minutes, decisions register, action chasing) — **reduced to a
school's reality: boards meet ~3× a year and members are not system
users.** The admin prepares; the board receives paper/PDF. No logins, no
portal — the anti-enterprise edge.

One screen (Reports group), internal tabs:

1. **Pack** — the auto-generated term board pack ( enrolment · collections ·
   arrears · staff costs · compliance status · head's academic report ),
   printable — the §0.5 "board meeting is the pulse" promise, materialized.
2. **Meetings** — agenda items, minutes-in-brief, **decisions/resolutions
   register** (searchable — "when did we decide that?" in one search),
   attendance. The principal (secretary) drafts academic items; the admin
   owns the record.
3. **Members** — the register: name, office (chair · treasurer · secretary ·
   member), appointing body, **term dates with expiry chips**, contact —
   the governance register auditors and the Ministry ask for.
4. **Actions** — items assigned in the meeting, chased onto the admin's
   Tasks (㊲) and Today card until closed.

Tables (§6.1): `board_member`, `board_meeting`, `board_minute_item`
(decision + action + owner + due). RLS: admin/principal only — the board
sees printouts, never screens.

**㉙ Report Builder — 🔮 future**
Custom cross-module reports (any dimension × measure) with CSV export.
Only after the base modules produce clean, allocated data.

### Settings

**㉚ School Profile — ✅ · ㉛ Terms & Calendar — ✅ · ㉜ Audit Trail — ✅**
Built. Audit trail stays monochrome, append-only, filtered, paginated.

**㉝ Users & Roles — ⚪ next**
Invite staff (row + magic link once better-auth lands), role change with
before/after audit (✅ in register), session/device list, force-sign-out.
Lands with the better-auth/OTP migration.

**㊷ Permissions Matrix — ⚪ next · NEW**
Makes the §0.5 boundary table real as **data**: module × role ownership,
landing tab per role, who is prompted to act, seeded with the two-leaders
defaults and editable by the admin. The hardcoded `role IN (…)` checks stay
as the security floor (both roles may act when the other is absent); the
matrix only shapes nav, defaults and prompts above that floor.

**㊻ Duties & Appointments — ⚪ next · NEW**
The `staff_duty` registry (§0.6): every hat — deputy, discipline master,
G&C, HOD, exams officer, class-teacher-of, patron-of, librarian,
dorm-parent-of — as scope-carrying rows appointed by principal/admin,
audited, with effective dates. This screen is where §0.6's lattice becomes
manageable; every conditional surface in the product reads its "who" from
here. Cards: duty coverage (hats unassigned flagged), multi-hat load per
teacher.

**㉞ Documents Vault — 🔮 future**
Admission documents, contracts, licences, certificates — S3-style storage,
per-entity links, RLS-scoped. Feeds Compliance ㉘ and HR ⑥.

**㉟ Integrations — ⚪ next**
Status + credentials screen for the school's rails: WhatsApp worker (Talk),
SMS fallback, M-Pesa Daraja (⑭), email. Show connection health; secrets stay
in the platform, never in the school DB.

---

## 3. The Pulse — one vital sign per sector (Today tab)

| Sector | Vital sign | Source module |
|---|---|---|
| Money | collected this term · outstanding · collection-rate meter | ⑧–⑪ |
| People | staff active · learners active · enrolment trend | ①–⑤ |
| Admissions | inquiries open · conversion this term | ③ |
| Classroom | attendance today % · assessment capture coverage | ⑰⑱ |
| Talk | parents-on-WhatsApp % · delivery failures | ㉗ |
| Operations | routes running · overdue loans · low stock | ⑳–㉒ |
| Compliance | KEMIS/TSC/licence readiness chips · countdowns | ㉘ |
| Governance | audit heartbeat · term countdown | ㉜ |
| Approvals | pending sign-offs · oldest waiting | ㊱ |
| Payroll | salaries due vs collected | ⑦ ⚪ (promoted) |

Plus: search (school-wide ✅), bell (real counts ✅), profile menu (✅),
live animated charts (✅), hover tooltips (✅).

---

## 4. Build order — phases

**Phase 1 — the money & compliance term (next)**
1. **Fee Structures ⑫** — editor + bulk-apply + sibling discounts + payment plans (allocation join table ready per the fee reality-check)
2. **Invoices & Statements ⑬** — same-query trust fix, PDF/print, SMS receipts
3. **Admissions ③** — funnel, auto admission-no, sibling auto-link
4. **Compliance Center ㉘** — KEMIS/TSC/licence on one screen
5. **Curriculum Setup ⑯** — the 008–010 packs get their UI

**Phase 2 — the operations term**
6. Money Rails ⑭ (Daraja C2B assist + bank import) — assists the manual-first flow, never replaces it
7. Attendance Oversight ⑰ + Exams & Report Cards ⑱ — closes the classroom loop
8. Users & Roles ㉝ + Permissions Matrix ㊷ — with better-auth/OTP; seed signup as `admin` (§0.5)
9. Approvals Inbox ㊱ + Tasks & Follow-ups ㊲ — the two-leaders hinge
10. Sections & Patrons ㊸ + the patron's surface ㊸a · Conduct & Welfare ㊹㊺ + Duties registry ㊻ — the engine that absorbs every remaining school activity and every staff hat (lab, sports, drama, discipline, counselling…) without new modules or role enums
11. **Payroll ⑦** — contracts → monthly/term run → admin approval → manual/bulk disbursement → payslips by phone; `statutory_rates` seeded per year
12. **Board & BOM ㊶** + **Facilities & lockers/desks ㊴** + **Hostel & beds ㉓** + Infirmary — the governance pack, the asset/repair flow with the janitor's My Area (dorms included), boarding life, and health records
13. Transport ⑳ + Library ㉑ + Store ㉒ screens (schema first, per module)
14. Events & Calendar ㉔; Learner 360 + bulk CSV import ②; media consent (§6.5 #7); switching import (§6.5 #9)

**Phase 3 — the depth term (🔮)**
11. HR & Leave ⑥ 🔮 · Timetable ⑲ · Hostel ㉓ · Petty Cash ⑮ · Purchases ㊳ · Co-curricular ㊵ · Report Builder ㉙ · Documents Vault ㉞ · multi-school groups, offline, alumni (§6.5 flanks)

**Gates every phase must pass:** typecheck both apps · RLS behavioral suite ·
module harness (`debug-modules.mjs`) extended with the phase's endpoints ·
browser pass as `admin@demo.mandela.school` · no hardcoded strings
(`grep` sweep) · forms conform to `docs/FORM-NAV-STANDARDS.md`.

---

## 5. Deliberate exclusions (anti-bloat, with reversal triggers)

| Groups **Insights → Reports**, **Sections engine** decided/designed 2026-09-12 — see §1.5 and ㊸ | | |

| Excluded | Why | Reversal trigger |
|---|---|---|
| Full double-entry accounting | Bursar tools + accountant's ledger own it; we own collections | Auditors demand IFRS books in-product |
| Statutory payroll engine | ~~Rates change yearly; wrong payslip = legal exposure~~ **Reversal trigger fired 2026-09-12 (owner request) — promoted to module ⑦ ⚪**; rates as versioned seeded data keeps the legal risk managed | — |
| Two-way parent chat | Talk is school→guardian; replies = a second product | Principals ask to abandon WhatsApp for in-app |
| LMS/e-learning content | Not an admin-sector job | A pilot school demands it contractually |
| Government-capitation modules | Private schools receive none | None — hard exclusion |
| A bespoke module per school section (separate hostel/canteen/lab/visitor apps, the competitor pattern) | One Sections engine (㊸) covers all of them as rows | A section genuinely needs a fifth capability |

**The standing rule:** every new module must feed fees-in, enrolment, or
compliance; name which, in its spec, before it is built.

---

## 6.5 Open flanks — known gaps on the map (audit 2026-09-12)

Topics we have touched or that exist in schema/competitors but had **no
documented home** until now. Each carries a lean position; none is specced
to build-depth yet (document-first: they get full §2 specs when promoted).

| # | Flank | What exists today | Lean position | Phase |
|---|---|---|---|---|
| 1 | **Houses system** (sports/pastoral houses, points, competitions) | "house" appears once as a duty scope | Houses = **section rows of kind `house`** (㊸) + a points ledger; competitions are events (㉔). No separate module | 2 |
| 2 | **Alumni** | `alumni_profile` table exists in schema — zero docs, zero UI | Lightweight register (where they went, contacts) + alumni comms via Talk; a school's best referral channel. Pulses nothing | 3 |
| 3 | **Certificates, letters & IDs** (transfer/leaving certificates, admission letters, learner/staff ID cards) | Fedena ships generators; FEE-REALITY-CHECK flags the withholding controversy (printing ≠ withholding — an unpaid-fees blocklist is deliberately excluded) | **Template-driven document generation** from `school_settings` identity + register data; issued copies filed in vault ㉞. Feeds compliance | 2–3 |
| 4 | **Multi-school groups** (a proprietor with 2–5 schools) | Tenancy = one DB per school; no group view anywhere | Platform-level (control-plane) group mapping + a cross-school pulse for the owner. Real sales unlock for growing groups — needs a product decision before build | 3 |
| 5 | **Offline & low-connectivity resilience** | Manual-first money law (§2 ⑧) is the big mitigation; nothing documented for reads/writes offline | Reads cache as PWA; writes queue with explicit sync state. Honest tech decision needed — document constraints first | 3 |
| 6 | **Duty rosters** (break/supervision/yard duty) | MyEncore ships it; our duty lattice (§0.6) covers "who", not "when" | Fold into Tasks ㊲ (recurring, assigned) or Timetable ⑲ when it lands — not its own module | 3 |
| 7 | **Media & photo consent** | `consent` table handles levies; photos of minors are Kenya-DPA-sensitive | Extend consent kinds: `media` per guardian; Talk shows photos in announcements only for consented guardians | 2 |
| 8 | **Data retention & backups** | Old spec's open question; partitions roll monthly | Decide & record: audit kept forever (DPA favors), platform-managed backups, one-click export (§6.3 #7). Write the policy page | 1 |
| 9 | **Switching import** (migrate from a competitor/Excel) | Onboarding wizard (§6.3 #2) covers first CSV import | Explicit "coming from another system" path: mapping helper for the previous system's export shapes. Demo-to-sale killer for switchers | 2 |
| 10 | **Sales artifacts** (demo script, pricing, packaging) | **Decided by owner (2026-09-12): park — system first.** Revisit only when the product gap (§6.3) closes | — |
| 11 | **AI assists** (ParentSquare Intelligence is the frontier: message drafting, engagement insights) | Nothing — deliberately | Lean position: **AI drafts, humans decide** — remark drafts for report cards, plain-language drafts of parent messages, anomaly signals (attendance drop + fees arrears + conduct = one flag). Never auto-send, never auto-decide. Fits the honesty brand | 3 |
| 12 | **Pocket money & laundry** (boarding wallets, garment tracking) | In Hostel ㉓ depth-2 | Wallet rides the levy/allocation rails; laundry = kit custody per boarder. Ship after hostel core proves out | 3 |

Promotion rule: when one of these enters a build phase, it graduates to a
numbered §2 module spec (cards/forms/charts/tables) before any code.

---

## 7. Benchmarks — them vs us, and why (2026-09-12, all sourced)

Scale: **✅ strong · 🟡 partial · ❌ missing** — judged on the dimension a
Kenyan private-school owner buys on.

| Benchmark | Fedena (global, 21+17 modules) | Mzizi (Nairobi, local) | Intellimis (CBC-focused) | Dedicated tools (Lipana/SchoolDoc/BoardPro/SchoolDeck) | **Mandela** |
|---|---|---|---|---|
| Multi-curriculum | 🟡 static config | 🟡 "3 curricula, one dashboard" — lists, not deep structure | ✅ CBC-only depth | ❌ one lane each | ✅ **per-class packs + adaptive forms/vocab/reports** (§ CURRICULUM §4) |
| Calm nav / adoption | ❌ module sprawl, training-heavy | 🟡 simpler, but "older staff need extra training" (own review) | 🟡 | ❌ each tool = another login | ✅ **47 features → ~17 visible; every role sees a slice; bursar-on-a-Tuesday test** |
| Staff lattice (deputy/discipline/G&C/patron/janitor) | ❌ fixed role types | ❌ | 🟡 partial | ❌ | ✅ **hats compose via `staff_duty`** (§0.6, TSC-sourced) |
| Money model fit | 🟡 rail-dependent imports | ✅ auto-matching — **but needs reliable internet/power (own review)** | 🟡 | — | ✅ **manual-first law; rails assist** — runs on the day Paybill/power is down |
| Admin↔Principal boundary | ❌ | ❌ | 🟡 proprietor-centric | ❌ | ✅ **two-leaders model + Approvals Inbox + Permissions Matrix** (§0.5) |
| Governance / BOM | ❌ | ❌ | ❌ | ✅ BoardPro (enterprise portal, logins) | ✅ **paper-first Board & BOM ㊶ — no board logins** |
| Payroll (Kenya 3-population) | 🟡 generic HR | 🟡 generic "staff payroll" | ❌ | ✅ Lipana — **but another system to buy** | ✅ **in-product: TSC rows skipped with reason, versioned rates, approval loop, payslips by phone** (⑦) |
| Boarding | 🟡 hostel basics | 🟡 | ❌ | ✅ SchoolDeck (separate product) | ✅ **same learner, same ledger; beds as assets; damage bills to the right student** (㉓) |
| Health privacy (infirmary/G&C) | ❌ | ❌ | ❌ | ✅ SchoolDoc | ✅ **DPA-strict RLS lattice; allergy flags reach only who needs them at 2 AM** |
| Implementation reality | ❌ 6–12 months | 🟡 | 🟡 | ❌ each adds onboarding | ✅ **CSV everywhere + onboarding wizard + switching import** (§6.3) |
| Parent trust (balances) | 🟡 | 🟡 | ✅ sells the fix | — | ✅ **same-query architecture ⑬ — trust by construction, not marketing** |
| Compliance in one glance | 🟡 | 🟡 KEMIS-aware | ✅ CBC exams | ❌ | ✅ **Exam Entries ⑤ + Compliance Center ㉘ with countdowns** |

**Why the pattern holds:** the dedicated tools each win their lane deep but
fragment the school into five logins and five ledgers; the ERPs keep one
ledger but drown schools in modules and fixed roles; the local leader's own
review lists our four laws as its cons (internet, power, training,
subscription strain). **Nobody else holds one ledger, calm nav, Kenya-first
resilience, and the whole staff lattice at once — that combination is the
product.**

**Honesty row — where they lead today:** every ❌ we claim against them is
spec, not shipped code: Mzizi has live M-Pesa matching and a parent app in
market; Fedena has 15+ years of polish; Lipana/SchoolDoc/BoardPro are deeper
in their single lanes than we will ever be. **Our gap is execution, not
design — §6.3's seven sale-blockers and Phase 1–2 are the work.** Until they
ship, sell the wedge (§6.4), not the moat.

---

## 6. Sale-readiness gap analysis — the private-school buyer (2026-09-12)

**What already exists in schema** (verified across migrations 001–015, 31
tables): the full People register (staff/learner/guardian/learner_guardian),
class + academic_year + term, Money core (fee_structure, fee_item, consent,
mpesa_txn, payments, receipts, payment_allocation), Classroom (attendance,
assessment, homework + submissions), Talk (announcement, message), Library +
Store tables, curriculum packs (curriculum, curriculum_level, learning_area,
assessment_scheme — CBE/8-4-4/British), alumni_profile, audit_log.

### 6.1 Missing data models (migrations needed)

| Table | Feeds module | Phase |
|---|---|---|
| `admission_inquiry` (stage, source, child/guardian snapshot, converted_learner_id) | ③ Admissions | 1 |
| `exam_entry` (learner, exam year, candidate no, status per national exam) | ⑤ depth + ㉘ Compliance | 1 |
| sibling-discount rules + instalment plans (columns/tables on fee items) | ⑫ Fee Structures | 1 |
| `school_event` (title, date, kind, audience) | ㉔ Events | 2 |
| transport (route, bus, boarding point, manifest rows) | ⑳ Transport | 2 |
| `approval_request` (type, requester, payload JSON, decision, reason) + `admin_task` (source module, due, state) | ㊱㊲ Today | 2 |
| `section` (kind, head_staff_id, enabled) + `section_member` + `visitor_log` + `section_session` + `section_session_mark` | ㊸㊸a Sections | 2 |
| `asset` (kind, room, condition, photo, history) + `repair_report` (reporter, item, note, decision) | ㊴ Facilities / janitor My Area | 2 |
| `dorm` + `dorm_allocation` (boarder ↔ bed asset, term) + `exeat_pass` (guardian consent, approvals) + `hostel_rollcall` | ㉓ Hostel | 2 |
| `health_record` (allergies, chronic, immunizations) + `clinic_visit` (SOAP-lite) + `med_admin` (dose charted, stock deducts) | Infirmary (㊸ special case) | 2 |
| `staff_contract` + `statutory_rates` (versioned, seeded yearly) + `payroll_run` + `payslip` (+ extra deductions) | ⑦ Payroll | 2 |
| `staff_duty` (staff, duty, scope, appointed_by, dates) | ㊻ lattice / every conditional surface | 2 |
| `discipline_incident` (merit/demerit, action, parent_notified_at) + `counselling_case` (confidential) | ㊹㊺ Conduct & Welfare | 2 |
| `staff_leave` | ⑥ HR | 3 (🔮) |
| documents vault (S3-style refs, per-entity links) | ㉞ Vault | 3 (🔮) |

### 6.2 Missing code per live module (UI/API only — data exists)

- **Fee Structures ⑫ editor + bulk-apply + discounts** (fee tables exist, seeded-only today)
- **Invoices & Statements ⑬**: per-learner term statement, PDF/print, SMS receipt on confirm
- **Compliance Center ㉘**: pure reads over learner.upi + staff.tsc_no/national_id + CSV
- **Curriculum Setup ⑯**: attach classes to ladders, view schemes (008–010 tables waiting)
- **Attendance Oversight ⑰** and **Report Cards ⑱**: attendance/assessment data is written daily by teachers; admin coverage view + report-card generation are pure UI
- **Library ㉑ / Store ㉒ screens**: tables + RLS fully designed, zero screens
- **Learner 360 + CSV bulk import ②**

### 6.3 Platform gaps — the ones that decide the SALE

These are not admin modules but no private school buys without them:

1. **Real login.** Dev email-match auth cannot ship. Passwords/OTP (better-auth path) → also unlocks Users & Roles ㉝ invites. *Highest priority.*
2. **Onboarding wizard.** A school signs up and must reach day-one value fast: school profile → curriculum pick (the packs!) → terms → fee structure → CSV import of learners/guardians/staff. The provisioner exists; the guided flow doesn't. *This is the demo-to-sale converter.*
3. **M-Pesa Daraja ⑭** — as an *assist*: C2B callbacks pre-fill entries the bursar confirms; STK push later. Manual-first law holds (⑧). `mpesa_txn` table is waiting.
4. **WhatsApp delivery worker** (Talk). Parent-facing messaging is the retention feature parents actually feel; rows are `queued` today, sender worker ⚪.
5. **CSV bulk import everywhere.** 300 learners on paper → system in an afternoon, or the sale dies at implementation.
6. **Paper-proof exports.** Receipts, term statements, report cards as printable PDF — parents and auditors live on paper.
7. **Backups & data export.** "Your data leaves with you" — one-click full export per school; trust requirement for the owner-buyer.

### 6.4 What we sell FIRST (the wedge, per §0's three numbers)

The Phase-1 slice is sellable on its own: **fees in** (Structures + Statements + Rails) · **enrolment** (Admissions + CSV import) · **compliance** (Exam Entries + Compliance Center). Everything else deepens the account; the wedge closes it.
