# Mandela — School Management, Rebuilt Simple

**A complete platform for running a Kenyan school — money, people, academics, operations, care and governance — in one calm place.**

| | |
|---|---|
| Document | System overview for stakeholders, staff, investors and technical partners |
| Status | Live system (production-track, multi-tenant) |
| Repository | `github.com/lewisking2016/mandela` |
| Audience | Anyone who wants to understand what Mandela is, what it does today, and where it is going |
| Last updated | September 2026 |

---

## Table of contents

1. [What Mandela is](#1-what-mandela-is)
2. [The problem we are solving](#2-the-problem-we-are-solving)
3. [The end state — what we are building toward](#3-the-end-state--what-we-are-building-toward)
4. [The seven design laws](#4-the-seven-design-laws)
5. [Technical architecture](#5-technical-architecture)
6. [Security, privacy and multi-tenancy](#6-security-privacy-and-multi-tenancy)
7. [The people — twelve roles, twelve dashboards](#7-the-people--twelve-roles-twelve-dashboards)
8. [The module catalogue — every screen in the system](#8-the-module-catalogue--every-screen-in-the-system)
9. [Cross-cutting systems](#9-cross-cutting-systems)
10. [A day in the life of a Mandela school](#10-a-day-in-the-life-of-a-mandela-school)
11. [Environments and demo accounts](#11-environments-and-demo-accounts)
12. [Where the project stands today](#12-where-the-project-stands-today)
13. [Roadmap — from here to the end state](#13-roadmap--from-here-to-the-end-state)
14. [Glossary](#14-glossary)

---

## 1. What Mandela is

Mandela is a **school management platform built for Kenyan schools**, from small academies to large junior-secondary and primary schools. It replaces the spreadsheet-and-notebook reality of school administration with a single, calm system that answers, for every person in the school, one question at a time:

- The **head teacher** asks: *Is the term running — and what needs me?*
- The **bursar** asks: *What came in, what's expected, what's off?*
- The **teacher** asks: *Who's here, who's not, and what's due?*
- The **parent** asks: *What do I owe, and what's happening to my child?*
- The **dorm parent** asks: *Who's in, who's out tonight?*
- The **librarian** asks: *What's out, what's back, who's overdue?*

Every person signs in and lands on **their own dashboard** — a single screen that answers their question with real numbers from the school database, then takes them to exactly the tools their role needs. Nothing more, nothing less.

Mandela is **multi-tenant**: every school gets its own isolated, encrypted database. One deployment serves many schools; no school can ever see another school's data, enforced at the database layer itself (row-level security), not just in application code.

Mandela is **offline-aware**: it installs on a phone's home screen like an app, survives bad connectivity with a local offline page and queued work, and is designed for the realities of Kenyan mobile data.

Mandela is **audit-first**: every shilling, every mark, every role change, every exeat approval is written to an append-only audit log with who did it, when, and what changed. "One ledger, no arguments" is a product principle, not a slogan.

---

## 2. The problem we are solving

Walk into a typical Kenyan school office today and you will find:

**Money chaos.** Fee records live in exercise books and Excel files that disagree with each other. A parent pays via M-Pesa; somebody must notice the SMS, find the child's page in a ledger, write a receipt by hand, and hope the two copies match. Nobody can say, on any given morning, exactly how much is outstanding, per class, per learner, per term. Balances are disputed because there is no single source of truth.

**People sprawl.** Learner records exist on admission forms, in class registers, in the exam office's mark books, and — maybe — in a spreadsheet. When a learner transfers, records follow them by photocopy. Guardian contacts are out of date. Staff duties ("who is on gate duty this week?") live on a noticeboard.

**Academic fragmentation.** The CBC/CBE curriculum demands continuous assessment, but assessment records live in separate mark books per subject. Producing a report card means retyping scores from six books into one template. Nobody can answer "which department is behind on marking?" until the end of term, when it is too late.

**Operations blindness.** The bus driver keeps his own manifest. The dorm parent's nightly rollcall is a register nobody aggregates. The librarian's overdue list is a notebook. Repairs get reported by word of mouth. The visitor book sits at the gate. None of this information reaches the principal's desk until it becomes a crisis.

**Governance byafterthought.** Boards of Management meet quarterly and are shown whatever numbers somebody had time to type up. Who approved this expenditure? Who changed that learner's class? Who allowed that learner to leave school early? The answers live in memory.

Mandela exists because every one of these problems is the *same* problem: **the school has no single, trustworthy, real-time record of itself.**

---

## 3. The end state — what we are building toward

The finished system, which this document describes in detail, delivers a state we can state plainly:

> **Every person in the school — from the principal to the bus driver to the parent at home — signs into one system, sees a dashboard that answers their single most important question with live data, and can do their entire job from that screen without training, without papers, and without a single disputed number.**

Concretely, at the end of the build:

1. **A parent never disputes a balance again.** The parent's phone shows the same fee ledger the bursar sees, updated the instant M-Pesa confirms. Statements print on A4 or arrive as PDF.
2. **The principal runs the school from one screen.** Attendance, collections, incidents, approvals, staff on duty, department coverage — live, every morning, before the first bell.
3. **Money reconciles itself.** M-Pesa (via Safaricom Daraja) and bank statements flow into the same ledger; the system *suggests* matches between incoming payments and learners; a human confirms with one tap; every receipt is auditable and printable.
4. **Every learner has one file.** Admission, class history, guardians, fees, attendance, conduct, health (with strict access control), library, transport, club membership — one learner, one ID, one 360° view.
5. **Every support-staff role is a professional with tools.** The dorm parent takes nightly rollcall and manages exeats in the system. The driver runs a digital manifest. The librarian issues and returns with barcodes. The janitor files repairs with cost estimates. These people are *in* the system, not around it.
6. **Governance is automatic.** The BOM pack is generated, not typed. The audit trail answers "who did this?" in seconds. Approvals (leave, expenditure, exeats) flow through a real request-and-decide engine.
7. **Communication is reliable.** Announcements, fee reminders and homework reach guardians on WhatsApp — queued, delivered, tracked — with no phone-call chains.
8. **It works on a cheap phone, on 2G, in a village.** Installed to the home screen, skeleton loading states, offline page, and a UI designed for thumbs.

---

## 4. The seven design laws

Every feature in Mandela is judged against seven non-negotiable laws. They are written into the codebase itself and enforced in code review:

### Law 1 — The 3-tap rule
Every role reaches any of its tools in at most three taps. Each role's navigation has **at most five targets**. If a feature needs a fourth level of navigation, *the feature is wrong, not the shell*. This is why each dashboard answers one question instead of offering a menu.

### Law 2 — One question per screen
Each role's home screen is built around that role's prime question (see section 7). The screen answers it with live numbers first; tools come second. No dashboards-with-twenty-widgets. No portals to explore.

### Law 3 — Everything is data
School identity, motto, colors, navigation labels, landing tabs, permissions — all live in the database, editable by the school's admin from Settings, never hardcoded. A school rebrands itself without a developer. Role navigation is literally rows in a `perm_matrix` table.

### Law 4 — The database is the security floor
Row-Level Security (RLS) policies in PostgreSQL enforce who can read and write every table, per role, per session. Application code adds a *second* layer. The permissions matrix that admins edit shapes navigation and prompts — it can never grant anything the database forbids. Sensitive data (health records, counselling notes) is locked to the narrowest roles by policy, full stop.

### Law 5 — One ledger, no arguments
Fees, payments, balances: one query powers the parent's screen, the bursar's screen, the printed statement and the PDF. The same numbers everywhere, from the same database, at the same moment. Payments apply to fee items in strict FIFO order, so "cleared" always means the same thing.

### Law 6 — Skeletons, never spinners
Loading states are pre-composed skeletons shaped like the real screen. The system never feels broken on a slow connection; it feels like it is already there.

### Law 7 — Print like it's 1999 (on purpose)
Schools live on paper: receipts, statements, report cards, BOM packs. Every document prints to exact A4 from the browser and exports as a real PDF from the server — with the school's own name, address and logo, pulled from their settings. A printed Mandela receipt is indistinguishable from a professionally printed one.

---

## 5. Technical architecture

Mandela is a modern web platform assembled from boring, proven parts — chosen so a small team can run it for hundreds of schools.

### 5.1 The shape

```
┌────────────────────────────────────────────────────────────────┐
│                        A SCHOOL'S WORLD                        │
│                                                                │
│  Principal ── Bursar ── Teachers ── Parents(WhatsApp) ── ...   │
│      │            │           │              │                 │
│      └────────────┴───────────┴──────────────┘                 │
│                         │ HTTPS                                │
│              ┌──────────▼──────────┐                           │
│              │   Web app (Next.js) │  :3000 — the dashboards   │
│              │  React Server Comps │  PWA, offline-ready       │
│              └──────────┬──────────┘                           │
│                         │ internal HTTP + cookie session       │
│              ┌──────────▼──────────┐                           │
│              │   API (NestJS)      │  :4000 — every rule       │
│              │  zod-validated I/O  │  audit + approvals        │
│              └──────────┬──────────┘                           │
│         ┌───────────────┼──────────────────┐                   │
│         ▼               ▼                  ▼                   │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐         │
│  │ Control DB │  │ School DBs  │  │ Background work  │         │
│  │ (registry) │  │ mandela_*   │  │ rollups · outbox │         │
│  └────────────┘  └──────┬──────┘  └──────────────────┘         │
│                         │ RLS on every table                   │
│                   PostgreSQL ←── Daraja (M-Pesa) / WhatsApp    │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 The pieces

**Web app — Next.js 15 (App Router, React Server Components, Turbopack).**
The dashboards are React Server Components: the page is assembled *on the server* from the school's database and streamed to the browser, so a principal on a cheap phone sees real numbers on first paint, not a loading spinner. Interactive pieces (forms, tables, modals) are small client components. The whole shell — sidebar, topbar, live clock, notification bell, search — persists across navigation so only the content changes.

**API — NestJS with zod validation.**
Every write goes through one API that validates input shape (zod schemas), enforces role permissions, writes to the database inside the caller's RLS session, and appends an audit row. There is exactly one place where business rules live.

**PostgreSQL — with Row-Level Security as the foundation.**
Each school is its own database (`mandela_<school>`), provisioned with the same 52-versioned-migration chain, tracked in a `_mandela_migrations` table with checksums (Flyway-style). A separate *control* database is the registry: which schools exist, their subdomains, their join codes. Application connections open a session, set `app.role` / `app.staff_id` (or `app.guardian_id`) session variables, and from then on the database itself refuses any row the role may not see.

**Background workers.**
Two quiet loops run alongside the API:
- The **rollup worker** recomputes each school's role-dashboards every 60 seconds into a `role_pulse` cache; dashboards serve the fresh cache (under 90 seconds old) or compute live — a broken rollup degrades to today's live query, never to an empty screen.
- The **outbox (talk) worker** delivers WhatsApp messages to guardians through a provider (Meta WhatsApp Cloud API in production; a simulator in development), tracking each message from queued → sent with retries.

**Integrations.**
- **Safaricom Daraja (M-Pesa C2B)**: payments arrive at a callback endpoint, validated by a shared token, and land in the rails-matching flow.
- **WhatsApp (Meta Cloud API)**: announcements, fee nudges and homework notifications reach guardians where they actually read.
- **PDF service (pdfkit)**: statements, report cards and the BOM pack are rendered to real PDF bytes server-side for archiving and email.

**Progressive Web App.**
The app is installable (A2HS on Android, sheet prompt on iOS), has a web manifest, an offline page, an install banner, and a sync banner that tells users honestly when they are offline. One codebase serves desktop (sidebar) and phone (bottom tabs, stacked cards) layouts.

**Monorepo layout (pnpm workspace).**

```
frontend/apps/web        — the Next.js application (dashboards, print, login)
frontend/packages/ui     — @mandela/ui: shared design system (cards, KPIs,
                           skeletons, pills, meters, charts, RoleShell)
backend/apps/api         — the NestJS API (web controller, queries, pulses,
                           provisioner, workers, print/PDF)
backend/db/control       — control-DB schema
backend/db/school        — 52 versioned migrations for every school DB
docs/                    — build phases, blueprints, checklists, this document
```

---

## 6. Security, privacy and multi-tenancy

**Isolation.** Each school is a separate physical database. The control plane resolves a request's school from its subdomain (`demo.mandela.school` → database `mandela_demo`) or an explicit tenant cookie; there is no code path in which one school's query can touch another school's tables.

**Row-Level Security.** Inside a school, *rows* are protected, not just pages. Every session sets its role; the database applies per-table policies. Examples of the real policy families shipped:

- Attendance: leaders see all; a teacher sees their classes' learners; a dorm parent sees their dorm's boarders.
- Assessments: admin/principal/HOD see the school; a teacher sees their classes.
- Hostel: the dorm parent reads and rolls-call their own dorms only.
- Transport: the driver reads their route's points, bus, manifest and trips; only leadership writes.
- Staff records: directory-level reads for signed-in staff (so rosters and matrices can name people); sensitive writes are admin-only.
- Money: the bursar and leadership own it; the patron is deliberately read-only on money.
- Infirmary/clinic: the strictest policy in the system — principal and infirmary staff only. Even the dorm parent's dashboard deliberately omits clinic visits.

**Identity.** Staff sign in with school email + password (scrypt-hashed; rate-limited; a dev-tenant escape hatch exists for the demo). Guardians sign in with the phone number the school has on file, via OTP. New staff join with a **school join code** at `/register` — the code is rotatable from Settings and its rotation instantly kills the old one; every joiner is recorded and lands on a first-run screen to confirm their role.

**Authorization model — two layers, honestly labeled.**

1. **Code + RLS (the floor).** Hardcoded role checks and database policies. Immutable by any admin.
2. **The permissions matrix (the shape).** A `perm_matrix` of module × role cells — *owns* (acts and is prompted), *sees* (view only), *landing* (the tab they open at sign-in). The admin edits it live in Settings → Users & Duties; it drives what appears in each role's sidebar (grants are merged on top of each role's product-default navigation) and what prompts appear on dashboards. The matrix can **add visibility, never exceed the floor**.

**Audit everything.** An append-only `audit_log` (partitioned by month) records actor, action, entity, before/after JSON for: staff changes, role changes, permission edits, fee changes, payments, invoice items, section appointments, event changes, exeat decisions, transport changes, library movements, dorm allocations, incident records, document issuance… The admin's Audit & Switching screen browses it; the answer to "who did this?" is a query, not an investigation.

**Privacy (Kenya DPA-minded).** Media consent is tracked per learner per use. Retention policies are configurable per data class in the Compliance Center. Health and counselling data sit behind the narrowest policies. The guardian sees only their own children.

**Approvals engine.** Anything that deserves a second pair of eyes flows through `approval_request` → pending → decided (approved/rejected), with the decision and decider audited. Exeats, leave, payroll runs, petty cash and purchases all ride this pattern. The principal's and admin's dashboards surface pending approvals directly.

---

## 7. The people — twelve roles, twelve dashboards

Mandela models the real staff lattice of a Kenyan school. Eleven staff roles plus the guardian. Each role below lists: the question their screen answers, what they see (the live KPIs and lists from the actual system), and what they can do.

| Role | Signs in as | Prime question | World |
|---|---|---|---|
| Admin | admin@… | Is the term running — and what needs me? | Everything |
| Principal | principal@… | Is the school healthy — money, people, mood? | Oversight + approvals |
| Bursar | bursar@… | What came in, what's expected, what's off? | Money |
| Teacher | teacher@… | Who's here, who's not, and what's due? | Their classes |
| Counter / Front desk | counter@… | Who's here, who's calling, who's enrolling? | Visitors & admissions |
| Driver | driver@… | Who boards where, and who's left? | Transport |
| Dorm parent | dormparent@… | Who's in, who's out tonight? | Boarding |
| Janitor / Facilities | janitor@… | What's broken, and what got fixed this week? | Facilities & supplies |
| Librarian | librarian@… | What's out, what's back, who's overdue? | Library |
| Patron (club/house) | patron@… | Which house is ahead, what's running this week? | Their sections |
| HOD (Head of Dept) | hod@… | Is my department covered and marked? | Their learning area |
| Parent / Guardian | phone OTP | What do I owe, and what's happening? | Their children |

**The hat system.** Beyond the fixed role, staff can hold *duties* ("hats") — Deputy Principal, Discipline Master, Guidance & Counselling, Exams Officer, Librarian, HOD, **Patron of a specific section**, **Class teacher of a specific class**, **Dorm parent of a specific dorm** — appointed from Settings with an effective date and audited. One person, many hats: the admin who holds the Principal hat sees both worlds. Conditional screens read their "who" from the hat registry.

### 7.1 Admin — the term runner

**Screen: the governance pulse.** The admin's dashboard is the school's heartbeat, laid out as a bento of live cards:

- **Money now** — collected this term vs billed (count-up animation), the 7-day collection bars, outstanding across classes with a collection percentage.
- **Attendance today** — present / absent / expected, marked vs unmarked, the term's rate.
- **What needs me** — pending approvals and open tasks inline, decidable on the spot (each decision audited).
- **Setup wizard** — a 5-step onboarding checklist (school details → terms → classes → fee structure → staff) that rides the dashboard until the school is genuinely set up, then dismisses itself.
- **AI anomaly flag** — a detection pass over the week's numbers (collections dips, attendance cliffs) surfaced as a review card.
- **Sections card (with the Principal hat)** — the co-curricular lattice at a glance.

**Navigation (9 tabs):** Today · Money · Spend · People · Academics · Operations · Care · Insights · Settings — the full eight-mains map plus Settings. The admin is the only role with all of them.

### 7.2 Principal — the school's doctor

**Screen answers:** *Is the school healthy — money, people, mood?*

- Attendance percentage today, and a **14-day attendance trend** chart.
- **Incidents (7 days)** with a per-class breakdown — discipline temperature at a glance.
- **Approvals pending** with a live feed of who is waiting on what, since when.
- **Collection percentage** for the term (money health).
- **Absences by class** today — the roll-call hotspots.
- **Staff on duty today** from the duty roster.
- Holds the same **Sections and hat** surfaces as the admin.

**Navigation (7):** Today · Operations · Approve · Reports · Broadcast · Directory · Academics.

### 7.3 Bursar — the ledger keeper

**Screen answers:** *What came in, what's expected, what's off?*

- **Collected today / this term** vs **billed this term** (count-up), with the 7-day collection bars.
- **Pending confirmations** — payments waiting for a human "yes", oldest first, confirmable inline.
- **Rails suggestions** — bank-statement lines the system believes match a learner's fees, one tap to confirm or dismiss.
- **Top arrears class** and the **five biggest arrears** with exact balances.
- **Fee Reports**, **Levies**, **Reconcile** and the full money desk one tab away.

**Navigation (5):** Today · Collect · Reconcile · Levies · Reports.

### 7.4 Teacher — the activation role

**First run:** the very first screen a teacher sees is **the register itself** — mark the class (Present / Late / Absent / Excused, two taps per learner) — with the dashboard beneath it. A teacher who has not marked today is gently conscripted into marking before they browse.

**Screen answers:** *Who's here, who's not, and what's due?*

- **Present today / expected** for their class, with marked state.
- **Homework due in 7 days**, **unmarked assessments** (their own), **messages today** (WhatsApp volume to their class's guardians — the honest "unread" signal).
- **Today's timetable slots** in order, with mark-attendance and set-homework actions.
- **Duty today** if they are rostered.
- **The heatmap** — their class's last 10 marked days as a learner × day grid (green = here, L = late, X = absent). Patterns become visible at a glance: the Thursday-absence kid, the slide after mid-term.

**Navigation (5):** Today · Mark · Homework · Messages · Class.

### 7.5 Counter / Front desk — the school's face

**Screen answers:** *Who's here, who's calling, who's enrolling?*

- **Visitors on site** right now (signed in, not yet checked out) and the full visitor log with passes.
- **Calls logged today** (the phone register).
- **The admissions funnel** — open inquiries by stage (Inquiry → Visit → Assessment → Offered → Enrolled), with the newest inquiries and their follow-ups.
- **Fee inquiries today** and **today's events** (what front desk should expect).

**Navigation:** Today · Visitors · Inquiries · Directory · Calendar — plus any modules the admin grants (Money, Operations and Insights are commonly granted).

### 7.6 Driver — the road role

**Screen answers:** *Who boards where, and who's left?*

- **Today's trips** (AM run state), **on manifest** count, **not picked up** count — the number that matters at 6:40 AM.
- **The bus** (registration, on-route state).
- **The route, stop by stop** — ordered pickup points with times and kids-per-stop, ticked off as the run progresses.
- **The manifest** — learner by learner with their stop and pickup state.
- **Route-affecting events** — if the school calendar has something that will snarl traffic, the driver sees it.

**Navigation:** Today · Transport · Directory — plus grants (Operations, People, Insights).

### 7.7 Dorm parent — boarding life

**Screen answers:** *Who's in, who's out tonight?*

- **Beds tonight** — occupancy against capacity for their dorm(s) (e.g. 12/12, 100%).
- **Exeats out now** and **exeats pending decision** (requested → approved → out → returned), with reasons.
- **Laundry in custody** and today's laundry moves (sent out / returned, bag refs).
- **Incidents (7 days)** among their boarders.
- **Tonight's rollcall** — the learner list with bed labels and present-state, taken in a few taps (latecomers re-markable).

**Navigation:** Today · Hostel · Laundry · Care · Directory.

### 7.8 Janitor / Facilities — the keeper

**Screen answers:** *What's broken, and what got fixed this week?*

- **Open repairs**, **done this week**, **structural open** (the "needs the office" flag), and the **estimated cost** of the open queue in KES.
- **The repair queue** — structural first, oldest first: room, item, condition, estimate.
- **Supplies low** — stock items at or below their reorder threshold, with quantities and locations.

**Navigation:** Today · Facilities · Store · Operations · Directory.

### 7.9 Librarian — the desk

**Screen answers:** *What's out, what's back, who's overdue?*

- **Copies out / due today / overdue / new titles this term** as four live KPIs.
- **The returns feed** — learner, title, barcode, due date, overdue flag, oldest first.
- **Borrowing by class (30 days)** — the reading-culture bars.
- **Latest catalogue additions** with copy counts.

**Navigation:** Today · Library · Academics · Directory · Insights.

### 7.10 Patron — sections & houses

**Screen answers:** *Which house is ahead, what's running this week?*

- **The leader** — which house leads and on how many points.
- **House standings** — points across every award this year as bars.
- **My sections** — the clubs/houses/teams whose patron hat they hold, with membership.
- **Sessions (7 days)** held, **kit low** (equipment at/below minimum in their section's inventory), **events this week**.

**Navigation:** Today · Sections · Houses · Events · Directory.

### 7.11 HOD — head of department

**Screen answers:** *Is my department covered and marked?* — rendered as **the teacher dashboard plus a department overlay** (an HOD is a senior teacher; their screen shows their own teaching life *and* their department's):

- **Department** — the learning area they teach most (e.g. Mathematics), department **coverage %** (timetable slots with a teacher), **dept teachers** count.
- **Marking** — unmarked assessments in the department, **by teacher** (the accountability list), department **mean vs school mean**, per-subject means.
- **Gaps today** — department lessons on today's timetable without a teacher.
- Beneath: their full teacher dashboard (their class, their marks, their heatmap).

**Navigation:** Today · Academics · Exams · People · Insights.

### 7.12 Parent / Guardian — the family window

**Screen answers:** *What do I owe, and what's happening?*

- **A card per child**: billed / paid / balance in KES with a progress meter, class, "Fully paid" or "Balance due" state, the latest fee item.
- **Homework coming due** across their children's classes.
- **Pay** — pay fees with M-Pesa instructions; **Messages** — the school's announcements; **Profile** — children, contact channels (WhatsApp preferences), and link codes for additional children.
- Receives statements, receipts and school communication on WhatsApp; sees the **same ledger** the office sees.

**Navigation (5):** Home · Pay · Homework · Messages · Profile.

---

## 8. The module catalogue — every screen in the system

The sidebar's eight mains organize 40+ modules. Each table row is a real route in the shipped product.

### 8.1 Money

| Module | Route | What it does |
|---|---|---|
| Collect | `/app/money` | Record a payment against a learner: method (M-Pesa, cash, bank, cheque), reference, amount. Issues a receipt number instantly; prints on A4; writes the ledger and the audit trail. |
| Invoices & Statements | `/app/money/invoices` | The per-learner ledger: bills, payments, FIFO-applied balances, per-item cleared states. One-tap **Statement** modal per learner; A4 print page; server PDF. Bulk billing helpers. |
| Fees, Levies & Pocket | `/app/money/fees` | Fee structures per class/term; optional levies with guardian consent gating; discounts; payment plans. |
| Confirm & Rails | `/app/reconcile` + `/app/money/rails` | The bank-confirmation desk: pending payments awaiting a human "yes"; bank CSV import; **rails_match** suggestions linking statement lines to learners; confirm/dismiss, all audited. |
| Fee Reports | `/app/reports` | Collections by class, term summaries, arrears lists — the print-and-take-to-meeting views. |
| Levies | `/app/levies` | Standing levies overview (desk for the counter/bursar split). |
| Payroll | `/app/people/payroll` | Staff contracts → payroll runs (compute → approve → disburse) with payslips staff confirm themselves; leave proration; payroll-vs-collections health check. |
| Petty Cash & Budgets | `/app/money/petty` | Petty centers, spend records with approval flow, budgets per center/term. |
| Purchases & Suppliers | `/app/money/purchases` | Supplier register (toggle active), purchase requests (draft → submitted → approved → ordered), approvals audited. |
| Store & Kit | `/app/operations/store` | Stock items with unit prices, quantities, reorder thresholds and locations; stock adjustments; section kit tagging (see Sections). |

**The money law:** every KES in the system is either *billed*, *paid*, or *balance* — computed by one FIFO waterfall query shared by the parent screen, the bursar screen, the statement print and the PDF. Optional levies only bill after recorded guardian consent. Overpayments are shown honestly as credit carried forward, never silently absorbed.

### 8.2 People

| Module | Route | What it does |
|---|---|---|
| People register | `/app/people` | The five registers behind one door: staff, learners, guardians, alumni, admissions. |
| Admissions | `/app/people/admissions` | The inquiry funnel — capture a walk-in/call (child, parent, contact, level of interest, source), move it stage by stage (inquiry → visit → assessment → offered → enrolled/lost), **convert to a full learner** with an auto admission number, and see funnel analytics. |
| Staff Register | `/app/people/staff` | Staff records: names, contacts, TSC number, role, classes; role changes (audited, admin-only); password set; duties. |
| Learners | `/app/people/learners` | The learner register: admission number, UPI, class, boarding status, guardians; CSV import; upsert; **class moves with history**; the **Learner 360** view (identity, guardians, fee ledger, attendance history, conduct, library, transport, clubs). |
| Guardians & Parents | `/app/people/guardians` | Guardian records, learner links (one family, one phone), channel preferences; bulk import; guardian directory. |
| HR & Leave | `/app/people/hr` | Leave requests and decisions, HR overview of contracts and leave balances. |
| Alumni | `/app/people/alumni` | Mark departing learners as alumni; keep the relationship. |
| Conduct & Welfare | `/app/people/conduct` | Discipline incidents (merit/demerit, category, points, action, parent-notified flag) and **counselling cases** (open → referred → closed, with notes) — welfare handled with dignity and audit. |

### 8.3 Academics

| Module | Route | What it does |
|---|---|---|
| Curriculum Setup | `/app/academics/curriculum` | The CBE ladder: curriculum packs → levels → strands/sub-strands; attach classes to levels. The academic spine everything else hangs from. |
| Timetable | `/app/academics/timetable` | Per-class weekly slots: day, period, times, learning area (code + name), teacher, room. Upsert/clear with audit; the coverage data HODs and school leadership live on. |
| Mark (attendance) | `/app/mark` | The teacher's daily register — the two-taps-per-learner screen, saved to the roll immediately. |
| Attendance Oversight | `/app/academics/attendance` | School-wide attendance for leadership: today, trends, by class. |
| Exams, Entries & Report Cards | `/app/academics/exams` | Assessment coverage (who has marked what, per subject per class), exam entries for candidates, **report-card generation** (marks → grades AL1–AL8 → printable card with school branding), principal approval gate, server PDF, AI-drafted remarks (teacher-editable, never auto-sent). |
| My Class | `/app/class` | The class teacher's view of their class: learners, attendance patterns, parents' contacts. |
| Homework | `/app/homework` | Assign homework per class/subject with due dates; guardians see due items on their home screen. |
| Library (academic door) | `/app/operations/library` | Also reachable from Academics — the catalogue and the issue desk. |

**The assessment law:** scores live once, keyed by learner + term + subject + exam type (cat / midterm / endterm). Grades derive from achievement levels (AL1–AL8). Report cards assemble from the same rows the HOD's marking dashboard watches — no retyping, ever.

### 8.4 Operations

| Module | Route | What it does |
|---|---|---|
| Sections & Patrons | `/app/operations/sections` | **One generic engine for everything outside classrooms**: labs, sports teams, drama, music, clubs, mess, security, infirmary, library, store, transport, houses. Each section: a patron (hat appointment, audited), members, **sessions** (held with topics), **kit** (equipment items with quantities and minimums), events, and its own register. |
| Events & Calendar | `/app/operations/events` | The term calendar everyone plans around: events, exam windows, open days, holidays, meetings, house competitions — with audiences (whole school, guardians, a section, a house). Feeds dashboards (driver's "route-affecting events", counter's "today"). |
| Duty Rosters | `/app/operations/rosters` | Weekly duty slots per staff member (gate, prep, meals…); emits today's duty onto the right dashboards; supports task generation. |
| Facilities & Repairs | `/app/operations/facilities` | **Anyone reports** (teacher or janitor, two taps: room, item, condition worn/broken/structural, photo, estimate); leadership decides repair-vs-replace (verdict), tracks state (open → in-repair → done / out-of-service) and cost. The janitor's queue and the school's maintenance budget come from the same rows. |
| Transport | `/app/operations/transport` | Routes (with term transport fee), ordered pickup points, buses (capacity, assigned driver), the **term manifest** (learner ↔ stop), and **trips** (AM run, done flag, notes). The driver's whole world; parents' pickup promises become checkable. |
| Library | `/app/operations/library` | Titles and copy barcodes; issue to a learner with a due date; return; the overdue engine feeding the librarian's dashboard; borrowing analytics by class. |
| Hostel & Mess | `/app/operations/hostel` + `/app/operations/mess` | Dorms (capacity, kind, dorm parent), bed-level allocations, **exeat passes** (request → approve → out → return, guardian consent recorded, fully audited), **nightly rollcall**; mess: the week's menu, meal service and headcounts. |
| Infirmary & Security | `/app/operations/infirmary` + `/app/operations/security` | Health records and clinic visits behind the strictest RLS in the system; the **visitor desk**: sign-in with pass number, purpose and host, sign-out, the live "on site" list the counter sees. |
| Houses & Co-curricular | `/app/operations/houses` | House points (award with reason — audited), house competitions on the calendar, co-curricular activity fees. |
| Media Consent | `/app/operations/consent` | Per-learner, per-use media consent register (photos, socials, press) — DPA compliance made operational. |
| Documents Vault | `/app/operations/vault` | Document templates (letters, certificates) → issue to a learner/staff with real data → print/PDF → the issued-documents archive. |

### 8.5 Insights

| Module | Route | What it does |
|---|---|---|
| Insights home | `/app/insights` | The analytical overview door. |
| Compliance Center | `/app/insights/compliance` | A live compliance rollup (registrations, consents, policies, retention) with editable lines and the school's **retention policy** per data class. |
| Report Builder | `/app/insights/reports` | Ad-hoc data pulls for meetings and ministry returns. |
| Approvals inbox | `/app/approve` | Everything awaiting a decision, one list, decide inline. |
| Inbox (Approvals & Tasks) | `/app/inbox` | The unified work queue: raised approvals and generated tasks (from rosters, repairs, admissions follow-ups). |
| Audit & Switching | `/app/settings#audit` + `/app/settings/switch-import` | The audit trail browser; the **switching import** tool for schools migrating from another system (map once, import, verify). |
| Documents Vault | `/app/operations/vault` | Also an insight: what has been issued, to whom, when. |

### 8.6 Settings

| Module | Route | What it does |
|---|---|---|
| School Profile & Terms | `/app/settings` | Name, motto, contacts, quote band, module cards, **logo**, and the **theme editor** (school colors on ink/paper tokens — the whole UI re-skins to the school). Academic years and terms with dates. |
| Users & Duties | `/app/settings/users` | The governance desk: **team & join code** (display + rotate), the **users table** (change roles, set passwords), the **permissions matrix** (owns / sees / landing per module × role — drives navigation live), and the **duties board** (appoint the nine hat types with effective dates). |
| School Health | `/app/settings/health` | System self-checks for the school's admins. |
| Board & BOM | `/app/settings/board` | Board of Management members and meetings; feeds the printable **BOM pack**. |
| Flags & Integrations | `/app/settings/flags` + `/app/settings/integrations` | Feature flags; WhatsApp provider configuration; M-Pesa/Daraja status. |
| Switching Import | `/app/settings/switch-import` | Migration from legacy systems: upload, map, verify, commit — with every imported row audited. |

### 8.7 The parent's modules

| Module | Route | What it does |
|---|---|---|
| Home | `/app` | The per-child fee cards and homework due (section 7.12). |
| Pay | `/app/pay` | Fee payment with M-Pesa instructions; the ledger they see is the office's ledger. |
| Homework | `/app/homework` | What is due, per child. |
| Messages | `/app/messages` | School announcements and the message archive. |
| Profile | `/app/profile` | Children linked to this guardian (with link codes), WhatsApp channel preferences, contact details. |

---

## 9. Cross-cutting systems

### 9.1 The communications engine (Talk)
Announcements, fee nudges, homework notices and report-card availability become **messages** to guardians. Every message flows: composed → queued (outbox) → delivered via WhatsApp provider → tracked (sent / failed, retried). The simulate provider in development makes the whole flow testable without spending shillings. Message volume per class feeds the teacher's dashboard as their "messages today" signal.

### 9.2 The audit spine
One partitioned table, one write path, one browser. Every state change that matters is recorded with actor, action, entity and before/after JSON — and the admin's Audit screen filters it. This is what makes "one ledger, no arguments" enforceable rather than aspirational.

### 9.3 The approvals pattern
Exeat? Leave? Payroll run? Petty spend? Purchase? All follow: **request → pending → decided**, with requester, decider, timestamps and audit rows. Dashboards surface pending counts; the Approve screen decides; nothing bypasses.

### 9.4 Print & PDF
Two print markers (`[data-doc]` for full-page documents, `[data-statement]` for the in-app statement) guarantee that printing isolates exactly the document — school letterhead, learner details, itemized money, signature lines — with zero UI chrome. The server-side PDF service produces the same documents as real PDF bytes for WhatsApp and archival. Receipts, statements, report cards, and the Board pack all ride this.

### 9.5 LIVE everywhere
A tiny change-detection hash per school is polled every 15 seconds from every dashboard (paused when the tab is hidden); when the school's data changes, the screen quietly refreshes itself. The LIVE dot and ticking clock say "this is current" honestly.

### 9.6 The AI layer (deliberately small and honest)
An anomaly detector reviews the week's operational numbers and surfaces flags for leadership review as drafts — never auto-actions. Report-card **remark drafting** produces an editable suggestion per learner. The AI never touches money, never sends anything, and never decides — it drafts, humans approve.

### 9.7 Offline & PWA
Installable, manifest + icons, offline page, sync banner, install prompts per platform. The system is designed for a school whose internet drops at 10 AM and returns at noon: nothing is lost, the UI explains itself, and queued work (like the outbox) drains when connectivity returns.

---

## 10. A day in the life of a Mandela school

**6:30 AM — The run.** The driver opens Mandela: 1 trip today, 8 on the manifest, 8 not picked up, bus KDA 001X on route. Stop by stop — Kilimani 3 kids, Ngong Road 2, Adams Arcade 2, School gate 1. Today's calendar shows a morning event near town; the driver knows traffic will be bad.

**7:45 AM — The roll.** Teachers mark their classes from the register screen — two taps per learner. The principal's dashboard ticks up: attendance 94%, two classes lagging, their names on the absences list. A duty roster shows who is on gate.

**9:00 AM — Money.** A parent pays Term 3 tuition via M-Pesa. Daraja calls the API; the payment lands pending. The bursar confirms it in one tap; the receipt prints with the school's letterhead; the parent's phone shows the balance drop — the same number, the same query, the same instant. A bank statement imported at the same time yields two match suggestions, confirmed and dismissed in seconds.

**11:00 AM — The broken window.** A teacher reports it from class: room B4, window pane, broken, estimate auto-suggested. The janitor's queue reorders itself; the structural flag on yesterday's lintel crack still sits at the top marked "needs the office."

**2:00 PM — Department check.** The Mathematics HOD opens their dashboard: coverage 100% this week, 6 assessments still unmarked — four by one teacher, named on the list. The dept mean sits 3 points above the school mean. One gentle conversation, backed by data.

**4:00 PM — Admissions.** A walk-in at the counter: two taps to capture the inquiry, a follow-up date, a stage. Friday's open-day visit is already on the funnel. When the family says yes, "convert" creates the learner, the admission number, the guardian link — in one motion.

**8:00 PM — Lights out.** The dorm parent takes the rollcall: 12 of 12 beds, one learner on exeat (out, expected tomorrow, mother acknowledged), laundry out for two boarders, one minor incident logged with a verbal warning and the parent notified. The principal's incident count for the week already includes it.

**Quarterly — The board.** The BOM pack generates itself: collections vs billing, attendance trends, incidents, staff matrix, maintenance costs, admissions funnel. Printed or PDF, with the school's branding. The audit trail answers the one question boards always ask — *who approved this?* — in seconds.

---

## 11. Environments and demo accounts

**Local demo (single machine):** the web app on `:3000`, the API on `:4000`, an embedded PostgreSQL on `:54329` (database `mandela_demo`), started with the repo's scripts. Provisioning, migrations and seeds are one command each.

**Demo tenants:** every school in the control registry gets an isolated database; the demo tenant is fully seeded — a living school with learners, guardians, fees, payments, attendance, homework, assessments, dorms, a route with a manifest, library copies on loan, repairs, house points, and all eleven staff roles populated so **no dashboard is ever empty**.

**Demo staff accounts** (all share the password `demo`, tenant `demo.mandela.school`):

| Role | Email |
|---|---|
| Admin | admin@demo.mandela.school |
| Principal | principal@demo.mandela.school |
| Bursar | bursar@demo.mandela.school |
| Teacher | teacher@demo.mandela.school |
| Counter | counter@demo.mandela.school |
| Driver | driver@demo.mandela.school |
| Dorm parent | dormparent@demo.mandela.school |
| Janitor | janitor@demo.mandela.school |
| Librarian | librarian@demo.mandela.school |
| Patron | patron@demo.mandela.school |
| HOD | hod@demo.mandela.school |
| Guardian | phone 0733 000 001 (OTP) |

Sign in as each in turn and the whole product presents itself — that is the fastest tour that exists.

---

## 12. Where the project stands today

Shipped and verified (September 2026):

- **All 12 roles live with real dashboards** — every role's pulse computes from the school database, with rollup caching for the eight school-wide roles.
- **The full money rail** — fees, optional-levy consent, invoices/statements (print + PDF), payment confirmations, M-Pesa/Daraja callback, bank-statement rails matching, payroll runs with payslips, petty cash, purchases, store, pocket money and laundry custody.
- **The academic spine** — CBE curriculum packs, timetable, attendance (class + oversight), assessments with AL grading, exams & entries, report cards (generate → approve → print → PDF), homework.
- **Operations complete** — sections/patrons engine, events, duty rosters, facilities, transport, library, hostel (exeats + nightly rollcall), mess, infirmary (locked), visitor desk, houses/points, consent, vault.
- **Governance complete** — users & roles, join codes, the permissions matrix driving navigation, the hat/duty registry, approvals engine, audit trail with partitions, retention & compliance, feature flags, integrations config, switching import.
- **The support-staff wave** — dorm parent, janitor, librarian, patron, HOD, counter and driver each have a live world: their own navigation (grant-driven), their own dashboards filled with their own data, and RLS policies making their access exactly right — verified role by role in the browser.
- **Infrastructure** — multi-tenant provisioning with 52 checksum-tracked migrations, rollup + outbox workers, WhatsApp (simulate/meta), Daraja validation, PWA/offline, print isolation, and a demo tenant rich enough to demo the entire product in one sitting.

---

## 13. Roadmap — from here to the end state

### Now (approved and next)
**Primary action + tools grid on the seven support dashboards.** Each support role's dashboard gets one unmistakable primary action and a grid of their daily tools, wired to the real endpoints:

- **Dorm parent** — primary: *Take rollcall*; tools: exeat recommend/return, laundry move (out/in), incident note, dorm occupancy.
- **Driver** — primary: *Run the route / mark done*; tools: stop ticks, not-picked-up escalation, relief-pickup note on breakdown.
- **Librarian** — primary: *Issue / Return*; tools: overdue chase list, catalogue add, reservations (FIFO), fine notes.
- **Counter** — primary: *Log a visitor*; tools: visitor checkout, call register, inquiry capture + stage moves, today's calendar.
- **Janitor** — primary: *Report a repair*; tools: supply request, my zones checklist, done-log.
- **Patron** — primary: *Award house points*; tools: hold a session, kit request, section event, register mark.
- **HOD** — primary: *Assign a department task* (with acknowledgement); tools: marking progress by teacher, coverage gaps, department inventory view.

### Next term (near)
- **M-Pesa STK push** — the parent pays *from* their dashboard; confirmation is automatic.
- **WhatsApp templates** — branded fee statements and report cards delivered to guardians directly.
- **KEMIS-ready exports** — ministry returns generated from live data.
- **Offline hardening** — attendance and rollcall queues locally when the network drops, drains on return.
- **BOM pack scheduler** — the quarterly pack compiles and delivers itself.

### The horizon (far)
- **Multi-school groups** — one proprietor, many schools, a group dashboard.
- **Timetable intelligence** — clash detection and auto-suggestions from coverage data.
- **Deeper AI insight** — fee-default risk flags, attendance-pattern alerts, all draft-and-approve.
- **Guardian app polish** — native-feeling PWA with push notifications.
- **Government reporting integrations** — as KEMIS/NEMIS-KPSET APIs open.

The principle that governs the roadmap: **every addition must keep the prime question on top and the three-tap law intact.** The system grows by making each role's screen more capable — never by making it bigger.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **CBE** | Competency-Based Education — Kenya's curriculum framework Mandela models natively (levels, strands, continuous assessment). |
| **AL1–AL8** | Achievement Levels 1–8, the CBE grading scale used on assessments and report cards. |
| **HOD** | Head of Department — the staff lead for a learning area (e.g. Mathematics). |
| **Patron** | The staff lead of a section (club, sport, house). A *hat*, not a fixed role. |
| **Hat / duty** | An appointment recorded in `staff_duty` (Deputy, Discipline, G&C, Exams Officer, Patron-of, Class-teacher-of, Dorm-parent-of…) — one person, many hats. |
| **Exeat** | Permission for a boarder to leave school, with states requested → approved → out → returned and guardian consent recorded. |
| **Rollcall** | The dorm parent's nightly present/absent register, per bed. |
| **Rails** | The bank/M-Pesa statement-matching flow — the system *suggests* which statement line pays which learner; a human confirms. |
| **Daraja** | Safaricom's M-Pesa API; Mandela receives C2B payment callbacks from it. |
| **FIFO waterfall** | Payments apply to a learner's fee items oldest-first, so balances and "cleared" states are unambiguous. |
| **RLS** | Row-Level Security — PostgreSQL policies that make the database itself enforce who may see each row. |
| **perm_matrix** | The module × role table (owns / sees / landing) that admins edit to shape navigation; can never exceed the RLS floor. |
| **Role pulse** | The per-role dashboard payload (KPIs + lists) computed from the school DB, cached for 60s by the rollup worker. |
| **Outbox / talk** | The message queue that delivers guardian communication via WhatsApp, with delivery tracking. |
| **BOM** | Board of Management — the school's governing board; Mandela generates its pack. |
| **Join code** | The rotating code staff use at `/register` to join a school's Mandela. |
| **Learner 360** | The single view of one learner: identity, guardians, money, attendance, conduct, library, transport, clubs. |
| **The 3-tap rule** | Any tool in ≤3 taps; ≤5 nav targets per role. A feature needing a 4th level is redesigned. |

---

*This document describes the system as built and verified as of September 2026. The codebase (`github.com/lewisking2016/mandela`), its 52 database migrations, and its live demo tenant are the source of truth; this document is their map.*
