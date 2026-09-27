# MANDELA — Platform Plan: Auth, Onboarding, Role Dashboards, Mobile & Architecture

> **The single working document for the next build phase.** It covers: the brand
> website (multi-page), the auth flow with join codes, the role-picker onboarding, every role
> dashboard (modules, sections, graphs), what we still add to the Admin dashboard,
> the mobile-app stack decision (small, fast, beautiful on low-storage phones), and
> the platform architecture for speed and readiness.
>
> **Design law: NOTHING changes visually.** Every screen in this plan is built from
> the existing `@mandela/ui` package and the current ink-and-paper theme
> (`docs/SIMPLICITY.md`, `docs/FORM-NAV-STANDARDS.md`, `docs/ADMIN-BLUEPRINT.md`).
> New screens assemble existing components; the few new components listed in §8
> are styled with the same tokens.
>
> Status: 📐 plan · built per phase in the build order (§11).
> Research sources are cited inline (§3) so decisions are traceable.

---

## 1. Product goals (measurable)

| Goal | Target | How we measure |
|---|---|---|
| 1-day school adoption | Admin signup → all staff on own dashboards → attendance marked → first WhatsApp digest sent, in one working day, unattended | Provisioner→activation timestamps in audit log |
| Zero-training UX | Any staff member productive on their first login, no manual | First-session task completion (e.g. teacher marks attendance) |
| Cognitive simplicity | ≤ 7 visible destinations per role; one primary action per screen | Nav audit per role |
| Small app footprint | Staff/parent app ≤ 25 MB download (≤ 15 MB per-ABI APK) | Play Console / APK Analyzer |
| Fast on any network | Dashboard TTFB < 800 ms on 3G; app cold start < 2 s on low-end Android | RSC timing logs; benchmark device |

---

## 2. What already exists (build on, don't rebuild)

Verified in code, September 2026:

- **Design system** `frontend/packages/ui` (`@mandela/ui`): `Card/CardHead`, `KpiCard`,
  `Meter`, `Delta`, `StatusPill`, `Money/CountUpMoney`, `CashflowChart`,
  `StatisticDonut/DonutLegend`, `DataTable`, `Wizard`, `SelectMenu`, `EmptyState`,
  `Skeleton`, `SerifHeader`, `Reveal`, `MandelaMark`, motion primitives.
- **`RoleShell`** (ui package): the 3-tap-rule shell with `roleNav` and
  `rolePrimeQuestion` — currently 6 roles (parent, teacher, bursar, principal,
  admin, driver). This plan extends it to 12 (§5).
- **Auth**: session cookies; staff email+password; guardian phone+OTP
  (`login_code` table, `requestLoginCode`/`verifyLoginCode`); login throttling.
- **Multi-tenancy**: one Postgres database per school, provisioned by the control
  plane; RLS inside each school DB (tested by `test:rls`); audit log hash-chained.
- **Permissions**: `perm_matrix` table with per-role `owns / sees / landing`
  columns and a Settings UI — `landing` is the hook for role dashboards.
- **Roles in DB** (`user_role` enum): admin, principal, teacher, bursar, counter,
  driver. Staff table carries one role; "hats" (duty posts) compose via `staff_duty`.
- **Admin app**: ~60% of `docs/ADMIN-BLUEPRINT.md` modules are ✅ built end-to-end
  (the blueprint's ⚪/🟡 markers are partly stale — §7 lists the verified remainder).
- **Guardian surface**: parent home (child cards: fees/homework/attendance), pay
  page, messages, profile — server-rendered, works on phone today.
- **Delivery worker** (`src/talk/worker.ts`): announcement fanout, daily digest,
  WhatsApp Cloud API + SMTP providers, per-school creds, test sends.
- **Money rails**: M-Pesa Daraja C2B callback → reconciliation suggestion; bank CSV
  import; confirm/approval workflow; petty cash; purchases; payroll runs.

---

## 3. Research findings → design decisions

Using agent-reach (Exa web search + Jina Reader). Sources: Kompassify *EdTech
Onboarding Guide* (2026); Schoolpad role-based redesign case study (salmanuiux.com);
Hick's Law / cognitive-load UX primers (sasft.org); SynergyBoat *Flutter vs React
Native vs Native 2025 benchmark*; Android Developers *offline-first* architecture
guide; multi-tenant SaaS join/invite patterns (enigmatica.ai); Kenya ICT-in-schools
studies (Mandera County 2026, Narok County 2019); ITU school-connectivity report.

1. **The join-code flow is the industry standard** for multi-tenant products:
   register → *create an org* or *join with a code* → code validates → membership
   with the right role → redirect to the role's home. It removes the admin as a
   bottleneck and lets every staff member self-serve in minutes. *(decision §4)*
2. **Teacher activation is the one metric that predicts platform usage.** "What
   must a teacher do, alone, on a Sunday evening, to use this in Tuesday's
   lesson?" — the answer must be: *tap, nothing else*. Teacher first-run is
   designed around one action: mark attendance. *(decision §6.3)*
3. **Role-based dashboards are what fixed adoption in a comparable product**
   (Schoolpad redesign): each role sees only its world; teachers got faster
   repetitive actions, parents got an instant-update feed. Result: faster task
   completion, fewer support tickets, higher daily usage. *(decision §6)*
4. **Hick's Law + progressive disclosure**: decision time grows with choices.
   Cap every role at ≤5–7 nav targets, show "Today" first, tuck advanced tools
   into secondary screens. *(decision: RoleShell stays the law)*
5. **Kenya reality (Mandera/Narok studies)**: phones are the only universally
   available device; usage is SMS/WhatsApp-dominant; connectivity and power are
   unreliable; digital literacy varies widely. → guardian-first channel stays
   WhatsApp; the app must tolerate 2G and offline moments; vocabulary stays
   standard-4 English (SIMPLICITY.md already codifies this).
6. **Framework benchmark 2025**: all three stacks render a first frame < 50 ms;
   native builds are smallest, Flutter mid-range, React Native (Expo) largest but
   trimmable; Flutter quickest startup, RN most consistent. Size and speed
   differences between Flutter and RN are real but small next to app *content*
   and image weight. *(decision §9: React Native/Expo — one language, one theme
   codebase, shared logic with the web, per-ABI split to hit the size budget)*
7. **Offline-first pattern** (Android architecture guidance): local store is the
   canonical read source; writes queue and sync with reconciliation; UI never
   talks to the network directly. Mandela already has a `sync_outbox` table and a
   flush action on the web — the mobile app reuses exactly this shape.
   *(decision §10.4)*

---

## 4. Brand website, auth flow & join-code onboarding (final spec)

### 4.1 Brand website (public — a website, not one page)

Mandela is positioned as **a brand schools join, not a system they install**.
The site owns the story; the app owns the work. Auth doors on the site deep-link
into the app (`/register`, OTP login). The three-door entry (parent / staff /
run-a-school) lives on the home page *and* on `/start`.

**Sitemap (launch set):**

| Page | Job | Key content |
|---|---|---|
| `/` Home | Brand promise in 5 seconds | Hero: headline + phone-first parent CTA + "I run a school / I work at a school" doors; product screenshot strip; 3 proof rows (fees collected, attendance, WhatsApp reach); schools counter; pricing teaser; final CTA |
| `/product` | Show the whole platform | Anchored module tour: Pulse, Money, Classroom, Operations, Messages, Records; per-role screenshots |
| `/for-schools` | Proprietor pitch | ROI math (collections uplift), the 1-day adoption story, data ownership & security, book-a-demo form |
| `/for-teachers` | Teacher pitch | "Attendance in 2 taps", workload cut, zero-training promise |
| `/for-parents` | Parent pitch | WhatsApp digest sample, how to get a login code, fees clarity — phone-first |
| `/pricing` | Remove the guesswork | Per-learner/month plans, what's included, M-Pesa billing, FAQ |
| `/stories` | Proof engine (blog) | School case studies + changelog; grows after launch |
| `/about` | The brand | Mission, why the name, values, team |
| `/contact` | Convert | Book a demo, WhatsApp button, phone, hours |
| `/legal` | Trust | Privacy, terms, child-data policy (KEMIS-aware), SLA |
| `/start` | The doors | Thin router: run-a-school → app admin registration; work-at-a-school → app staff registration; parent → app OTP login |

**Nav:** `Product · Schools · Pricing · Stories · About · [Sign in] [Get started]`
— ≤ 6 items (Hick's Law applies to the site too); mobile drawer; footer carries
the long tail.

**Tech & architecture:** new workspace app `frontend/apps/site` — Next.js,
fully static (SSG) + ISR for `/stories`, deployed to a CDN **independently of the
web app** so marketing ships without touching the product. It imports
`@mandela/ui` for tokens and primitives (Button, Card, MandelaMark) plus a small
marketing section kit. Domains: site on the root (`mandela.<tld>`), product on
`app.<tld>` (clean brand URLs: `mandela.<tld>/pricing`).

**Brand rules for the site** (extends, never changes, the product theme):
same ink-and-paper palette, deep-pine hero bands, lime accents, serif display
headlines, MandelaMark. Marketing-only extensions: a larger display type scale,
real-school photography (no AI stock), EN/SW language toggle (English default,
Kiswahili second — brand-level respect for the market). Copy obeys
SIMPLICITY.md voice: no jargon, standard-4 English.

**Performance & SEO budget:** LCP < 1.5 s on 3G; static HTML everywhere;
AVIF/WebP images with graceful fallbacks; per-page meta + OpenGraph (WhatsApp
link previews are a primary share surface for parents); `sitemap.xml`, `robots`,
JSON-LD (`Organization`, `Product`, `FAQPage`); zero client-side JS beyond the
CTA interactions (no framework hydration on content pages where avoidable).

### 4.2 Registration & roles (new `/register`)

Step 1 — account: full name, phone, email (optional for non-admin), password
(min 8; existing `password.ts` hashing).
Step 2 — **role picker**: 12 large cards (icon + one-line job description, 44 px+
touch targets), exactly the roles in §5. Admin card reads "I run a school".
Step 3 — school connection:

- **Admin**: school name → creates the school (provisioner) → **join code
  generated** (`MANDELA-XXXX`, `Crockford base32`, unambiguous charset, stored on
  the school row, regenerable by admin) → onboarding wizard (existing 5-step
  backend: profile, curriculum, term, fee structure, learners CSV — needs UI, §7).
  Checkbox: *"Are you also the principal?"* → sets the Principal hat (§5).
- **Everyone else**: enter the school's join code (auto-formatted, paste-friendly,
  show school name after validation — "Joining **Mandela Demo Junior School**") →
  staff row created with the chosen role in that school → first-login interstitial
  confirms role ("You're joining as **Teacher** — wrong? undo") → redirect to
  `perm_matrix.landing` for the role.
- **Guardian**: never sees codes. Phone + OTP; children appear because the school
  linked them (`learner_guardian`), possibly with a guardian-side "link code"
  handed out at admission (reuse join-code mechanism, one-time use).

### 4.3 Backend surface (small, additive)

| Change | Where | Notes |
|---|---|---|
| `user_role` enum + `dorm_parent, janitor, librarian, patron, hod` | migration | counter/driver already exist |
| `school.join_code` (unique, citext) + `join_code_updated_at` | control DB migration | regenerate = new code, old code invalid |
| `POST /web/auth/register` (staff): `{full_name, phone, email?, password, role, join_code}` | web.controller + queries | validates code → creates staff row (state `active`, `joined=true`) → session |
| `POST /web/auth/register-school` (admin): `{full_name, phone, password, school_name}` | ditto | provisions DB, returns join code |
| `GET /web/auth/school-by-code?code=` | ditto | returns school name only (no enumeration: rate-limit, generic 404) |
| `perm_matrix` seed rows for new roles | migration | §5 defaults |
| Settings → Team screen: show/regenerate join code, pending joiners list | admin UI | uses existing Users & Roles screen |

Security rules: codes are validated server-side only; registration is
rate-limited per IP + code; roles are chosen at registration but **changeable
only by admin** (no self-escalation); all joins audited (`staff.created`,
`school.joined`).

---

## 5. The 12 roles & the permission model

Two-leaders model stays (Admin = owner, Principal = academic leader) — **and one
person can hold both**: in small schools the proprietor/admin is also the
principal. The admin may take the **Principal hat** (`staff_duty`); effective
permissions are the union (the code already passes every
`["admin","principal"]` check for admins), the Pulse gains the Principal
sections (§6.2), and the profile shows both titles. Registration's "I run a
school" path asks *"Are you also the principal?"* and sets the hat there.
The new
roles are **permission profiles, not new codebases**: they inherit the module
screens the Admin already has, scoped by `perm_matrix` + RLS. Duty "hats"
continue to compose via `staff_duty` (a teacher can *also* be dorm parent on
Tuesdays).

| Role | DB role key | Owns (write) | Sees (read) | Landing (Today) |
|---|---|---|---|---|
| Admin | `admin` | everything | everything | Pulse (+ Principal sections when the hat is held) |
| Principal | `principal` | approvals, discipline, HR decisions | all academic + money read | Pulse (principal view) |
| Teacher | `teacher` | attendance, homework, assessments | own classes' learners | Class today |
| Bursar | `bursar` | payments, invoices, rails | money modules | Collections today |
| Counter (front desk) | `counter` | visitors, calls log, admissions inquiries | directory, calendar | Front desk |
| Driver | `driver` | trips, manifest ticks | own routes | Route today |
| Dorm parent | `dorm_parent` | rollcalls, exeats (recommend), laundry | own dorm's learners | Dorm tonight |
| Janitor | `janitor` | repair reports, supply requests | facilities board | Facilities today |
| Librarian | `librarian` | titles, issues, returns | library + readers | Library desk |
| Patron | `patron` | house points, section sessions, kit | sections, events | Sections today |
| HOD | `hod` | approve assessments in dept, dept coverage | dept subjects' marks | Department today |
| Guardian | (guardian kind) | own messages, consents, pays | own children only | Parent home |

HOD is both a role and a hat: an HOD is a teacher with a `staff_duty` hat of
"head of department: <dept>"; the dashboard adds department data on top of the
teacher view. (This matches the TSC lattice in ADMIN-BLUEPRINT §0.6.)

---

## 6. Role dashboards — every module, section and graph

**One template, twelve configs** (Schoolpad's core fix): every role's app is

```
SerifHeader (greeting + prime question + LiveBar)
[ 3–4 KPI cards — the role's numbers, counting up ]
[ 1 primary action — the role's main verb, huge ]
[ 1–2 feeds (today lists) ]
[ 1 chart where it earns its ink ]
[ needs-you-today card (inbox/tasks if the role has approvals) ]
```

Nav = `roleNav` (≤5 tabs). Settings per role = profile + notification channels +
password (admin keeps full Settings). All numbers come from one new `rolePulse`
SQL per role (same shape as `adminPulse`), computed on the server, streamed by RSC.

### 6.1 Admin — Today (already built, keep)
Pulse: money (collected/billed/outstanding), staff & learners on register,
attendance %, parents on WhatsApp, term countdown, needs-you-today (approvals +
overdue tasks), sections vitals, CashflowChart (6-month collected vs billed),
StatisticDonut (by method), recent transactions table, audit timeline,
collections-by-class meters. If the admin holds the **Principal hat**, a
Principal view toggle surfaces the §6.2 sections inside this same Pulse — one
account, both worlds. → Remaining admin work in §7.

### 6.2 Principal — Today
- **Prime question:** "Is the school healthy — money, people, mood?"
- **KPIs:** attendance % today · discipline incidents (7d) · approvals pending ·
  fee collection % (read-only)
- **Primary action:** Review approvals
- **Feed:** pending approvals (oldest first) · today's absences (by class) ·
  duty roster today
- **Charts:** attendance trend 14 days (sparkline strip); incidents by class (bars)
- **Tabs:** Today · Approve · Insights · Broadcast · Directory
- *Held by the Admin too: when the admin takes the Principal hat, this view
  merges into the admin Pulse — no second account, no second login.*

### 6.3 Teacher — Today  *(the activation role — design hardest here)*
- **Prime question:** "Who's here, who's not, and what's due?"
- **KPIs:** my class present/expected · homework due this week · unmarked
  assessments · messages unread
- **Primary action:** **Mark attendance** (opens today's roster — 2 taps total)
- **Feed:** today's timetable slots · homework due · my duty (if any)
- **Chart:** my class attendance, last 2 weeks (weekday strip, green/amber/red)
- **Tabs:** Today · Mark · Homework · Messages · Class
- *First-run:* if no attendance marked yet, Today IS the mark screen (research:
  teacher activation = one concrete event; nothing else may precede it).

### 6.4 Bursar — Today
- **Prime question:** "What came in, what's expected, what's off?"
- **KPIs:** collected today · collected this term vs billed · pending
  confirmations · top arrears class
- **Primary action:** Record a payment
- **Feed:** pending confirmations · rail suggestions (Daraja/bank CSV) to match ·
  largest arrears
- **Charts:** collections by class (meters — existing); collections last 7 days (bars)
- **Tabs:** Today · Collect · Reconcile · Levies · Reports

### 6.5 Counter — Front desk
- **Prime question:** "Who's here, who's calling, who's enrolling?"
- **KPIs:** visitors on site · calls logged today · admissions inquiries open ·
  fee inquiries today
- **Primary action:** Log a visitor
- **Feed:** visitors awaiting checkout · new inquiries · today's events
- **Chart:** inquiries by stage (mini funnel bars)
- **Tabs:** Today · Visitors · Inquiries · Directory · Calendar

### 6.6 Driver
- **Prime question:** "Who boards where, and who's left?"
- **KPIs:** today's trips · learners on manifest · not-picked-up · bus status
- **Primary action:** Run trip (morning route)
- **Feed:** manifest by stop with tick-off · today's events affecting routes
- **Chart:** none (keep it text-first; a route strip of stops with states)
- **Tabs:** Route · Manifest · Done (+Messages)

### 6.7 Dorm parent
- **Prime question:** "Who's in, who's out tonight?"
- **KPIs:** beds occupied/total · exeats out now · laundry in custody · incidents (7d)
- **Primary action:** **Take rollcall**
- **Feed:** tonight's rollcall list · pending exeats to decide/recommend ·
  clinic visits today
- **Chart:** occupancy by dorm (meters)
- **Tabs:** Today · Rollcall · Exeats · Laundry · My dorm

### 6.8 Janitor
- **Prime question:** "What's broken, what's assigned to me today?"
- **KPIs:** open repairs · assigned to me · done this week · supplies low
- **Primary action:** Report a repair / Mark done
- **Feed:** repair queue by urgency · supply requests · zones today
- **Chart:** none (list-first role)
- **Tabs:** Today · Repairs · Supplies · My zones

### 6.9 Librarian
- **Prime question:** "What's out, what's back, who's overdue?"
- **KPIs:** copies out · due today · overdue · new titles this term
- **Primary action:** Issue / Return a copy
- **Feed:** returns due today (learner + title) · overdue ladder · reservations
- **Chart:** borrowing by class (bars, last 30 days)
- **Tabs:** Today · Issue/Return · Catalogue · Overdue

### 6.10 Patron
- **Prime question:** "Which house is ahead, what's running this week?"
- **KPIs:** house points leader · events this week · kit items low · sessions held
- **Primary action:** Award house points
- **Feed:** this week's section sessions · competitions standing · kit requests
- **Chart:** house standings (horizontal bars in house colours — token-compliant)
- **Tabs:** Today · Sections · Points · Events

### 6.11 HOD
- **Prime question:** "Is my department covered and marked?"
- **KPIs:** coverage % (lessons vs timetable) · assessments unmarked · dept mean
  vs school mean · teachers present
- **Primary action:** Review unmarked assessments
- **Feed:** unmarked by teacher/class · low-score flags · dept timetable gaps
- **Chart:** subject means vs school mean (bars)
- **Tabs:** Today · Department · Marks · Coverage
- *(HOD view = teacher base + department overlay; one extra SQL, same shell.)*

### 6.12 Guardian (app + web)
- **Prime question:** "What do I owe, and what's happening today?"
- **KPIs:** balance per child · next due date · homework due · unread messages
- **Primary action:** Pay fees (M-Pesa instructions/STK-less flow first)
- **Feed:** child cards (fees meter, homework, yesterday's attendance) ·
  announcements · messages
- **Chart:** none — meters only (SIMPLICITY: numbers, not decorations)
- **Tabs:** Home · Pay · Homework · Messages · Profile (already specced in RoleShell)

---

## 7. Admin dashboard — verified remaining work + additions

The blueprint doc's ⚪ markers are partly stale; reconciled against code this week,
these are **actually** left:

**Finish**
1. Onboarding wizard UI (backend `getOnboardingState` exists — 5 steps, resume-able).
2. Term-scoped money on the Pulse ("collected this term" currently sums all time).
3. Actionable tasks/approvals on the Pulse (complete/dismiss inline).
4. Timetable depth (auto-layout by level/streams; currently hand-placed slots).
5. Server-side PDF for report cards/statements (print CSS is desktop-only today).
6. Learner photos & document uploads (needs object storage — §10.3).

**Add (new admin capabilities required by this plan)**
7. Settings → **Team**: join code display/regenerate, pending joiners, role
   changes, duty hats in one list.
8. Settings → **Permissions Matrix**: seed + review defaults for all 12 roles.
9. **Role dashboard editor** (admin-only): adjust each role's KPI toggles and
   landing module — stored back into `perm_matrix.landing` + a `role_home_config`
   JSON, so schools can tune without code (keeps "no hardcoding" law).
10. **Broadcast to staff** (announcements currently target guardians; staff
    channels needed for roster/task fanout messages).
11. **School health page**: adoption telemetry per role (activation status from
    §1) so the admin sees who hasn't started — the Kompassify "report per
    institution" principle, pointed at the school itself.

---

## 8. Component & graph inventory (theme unchanged)

Existing (reuse): `KpiCard`, `Meter`, `Delta`, `StatusPill`, `CashflowChart`,
`StatisticDonut`, `DonutLegend`, `DataTable`, `Wizard`, `SelectMenu`, `EmptyState`,
`Skeleton`, `SerifHeader`, `Reveal/CountUp`.

To build (all styled from existing tokens, ink-and-paper only):
- **SparklineStrip** — n-day mini bars (teacher attendance, bursar week)
- **WeekdayHeatmap** — attendance grid (rows=learners, cols=days, green/amber/red)
- **FunnelBars** — admissions stages (counter)
- **StandingsBars** — house points (patron)
- **RouteStrip** — stops with tick states (driver)
- **StopWatch** — none; the LiveBar already handles liveness.

Every new chart: one ink colour + semantic status colours, zero gradients,
tabular numerals, `motion` primitives for reveal (already in the package).

---

## 9. Mobile stack decision — the analysis

Requirement: good-looking UI, **low storage footprint**, fast, for users on
low-end Android phones with expensive data; guardians get an app too; theme must
be identical to web.

| Option | Size (download) | Speed | UI quality | Cost to us | Verdict |
|---|---|---|---|---|---|
| **PWA (web)** | ~0 MB install | Instant, cached | Same theme free | Lowest — it's this codebase | **Ship now for guardians** |
| **React Native + Expo** (Hermes, per-ABI APK) | ~15–25 MB → ~10–15 MB split | Cold start ~1–2 s low-end; 60 fps lists | Native-feel; reuses design tokens via NativeWind | One new codebase, but **same TypeScript**; shares types, validation, API client | **Staff + parent native app** |
| Flutter | ~12–20 MB | Best raw TTFF (~17 ms frame) | Excellent | **Second language (Dart)**; theme re-implemented; team split | No |
| Full native ×2 | Smallest | Best | Best | Two teams, two languages | No |

**Decision — CONFIRMED by owner 2026-09-25: React Native (Expo) + PWA.**
Kotlin evaluation preserved below for traceability; revisit only for a
hardware-driven "Pro" app.
1. **Guardians: PWA first** — installable from the WhatsApp welcome message,
   zero store friction, tiny footprint, already themed; offline shell + OTP login.
2. **Staff & parents who want it: one Expo React Native app** (Expo Router,
   Hermes). Why: single language across web+API+app (TypeScript everywhere),
   shared role logic and API types from this monorepo, OTA updates via Expo
   Updates for bug fixes without store rounds, SQLite+MMKV for offline-first
   (same `sync_outbox` pattern as web), NativeWind consumes the same design
   tokens → the theme carries over 1:1. Per-ABI APK + asset optimisation hits
   the ≤ 25 MB budget (benchmark research: RN size is trimmable outside Expo
   defaults; speed differences vs Flutter are imperceptible for list/form apps).
3. **Never two UI codebases**: any screen pattern proven on web RSC gets ported
   to the RN screen with the same prime question and KPIs.

**Store strategy:** Play Store for staff app (Kenya is Play-centric); App Store
later; guardians may never need it (PWA + WhatsApp covers the loop).

**Kotlin evaluation (asked and answered — kept for traceability):** Kotlin +
Jetpack Compose is genuinely excellent — smallest APKs (~5–10 MB), best raw
performance, first-class Android APIs, and Kenya is Android-dominant. It loses
here only on fit: a second language/toolchain beside an all-TypeScript monorepo,
a third re-implementation of the design theme, no OTA updates (store rounds for
every fix), and a costly iOS path later. **Kotlin is the right choice if/when**
we need deep hardware integrations (biometric/RFID attendance readers, receipt
printers) or hire Android specialists. **Note we don't exclude Kotlin by
choosing Expo:** device-level features can be added as Kotlin native modules
inside the Expo app — the stack decision is about the UI layer, not the
language. Revisit Kotlin/KMP for a "pro" app only after product-market fit.

---

## 10. Platform architecture & performance readiness

Keep: Next.js (web) + NestJS (API) + Postgres-per-school + control plane. No
rewrite. The additions below are ordered by "do now → do when scale demands".

### 10.1 Speed now (no new infra)
- **Role pulse queries as materialised rollups**: `role_pulse` per school updated
  by the existing worker (or a 60s refresh) so dashboards read one small table,
  not 12 aggregate queries. Targets the < 800 ms 3G TTFB.
- **Term-scoped everything**: money/attendance queries filter `term_id`
  (also fixes §7.2); add missing indexes: `attendance(day, learner_id)`,
  `payments(state, paid_at)`, `audit_log(at desc)`, `message(state, created_at)`.
- **RSC-first, zero client fetching**: all dashboards server-render; lists hard-
  capped (LIMIT 5–20) with "All →" links; skeletons already exist for streaming.
- **Bundle discipline**: `@mandela/ui` stays dependency-free (inline SVGs, no
  chart lib — charts are hand-rolled SVG); keep web JS < 200 kB gzip per route.
- **Images**: no learner photos until §10.3 exists; when it does, 128 px WebP
  thumbs, lazy, CDN-cached.
- **HTTP**: brotli at the edge, long-lived caching for `/_next/static`, session
  pages `no-store` but API reads get 10 s micro-cache for pulse endpoints.

### 10.2 Readiness (near-term infra)
- **Object storage** (S3-compatible, e.g. Cloudflare R2/Supabase storage) for
  photos, documents, portable records; presigned uploads; school-tenant prefix.
- **Redis** (single small instance): rate-limit counters (login codes, register
  endpoints), micro-cache for pulses, queue for the talk worker (replaces
  setInterval when > 50 schools).
- **Edge/CDN** in front of web (Vercel/CF): Kenya-adjacent POPs; the API stays
  in one region initially (Nairobi latency ~20–40 ms acceptable).

### 10.3 Offline-first (mobile & fragile connectivity)
Follow the Android offline-first guidance (local store = source of truth):
- RN app: SQLite (data) + MMKV (prefs) → reads never hit the network; writes
  append to a device outbox → flusher syncs when online (mirrors web
  `sync_outbox` + `flushOutboxAction` — same shape, shared semantics).
- Conflict rule stays the one the server already enforces: **last-write-wins per
  field with server validation**, money writes are never offline-queueable
  (manual-first law) — they require connectivity, by design.
- PWA: service worker caches the shell + last read pulse (stale-while-revalidate),
  OTP login is the only gate.

### 10.4 Scaling path (when, not now)
per-school DBs already shard horizontally; the talk worker shards by school;
the first true bottleneck will be the control DB (move read paths to Redis).
Re-visit only past ~100 active schools.

---

## 11. Build order (each phase shippable alone)

| # | Phase | Ships |
|---|---|---|
| 1 | **Auth + join codes** (§4.3 backend + /register UI) | staff self-serve joining |
| 2 | **Brand website** (§4.1 — new `frontend/apps/site`, static, launch set of pages) | the brand, findable and shareable |
| 3 | **Role-picker onboarding + `/start` doors** (§4.2) | the 1-day adoption path |
| 3 | **Onboarding wizard UI** (§7.1) | admin guided setup |
| 4 | **Role dashboards 6 roles that exist** (teacher, bursar, principal, counter, driver + admin polish) | `rolePulse` queries + `perm_matrix.landing` seeds |
| 5 | **New-role dashboards** (dorm parent, janitor, librarian, patron, HOD) + Team & Matrix admin screens | 12-role coverage |
| 6 | **Guardian PWA** (manifest, service worker, install from WhatsApp) | parent app at zero install |
| 7 | **Expo RN app** (shell, offline outbox, teacher + bursar + guardian screens) | store-ready app |
| 8 | **Perf rollups + object storage** (§10.1–10.3 items not yet done) | scale headroom |

Definition of done per phase: typechecks green, RLS test passes, every new screen
uses only `@mandela/ui` components, audit entries written for every write, and a
manual run-through at 390 px and 1536 px widths.

---

## 12. Open decisions for the owner
1. Guardian "link code" at admission (one-time code linking guardian↔learner) —
   build now or defer to admissions phase? *(recommended: now, it completes the
   parent loop)*
2. HOD as DB role vs pure duty-hat *(recommended: hat only, §5 note)*.
3. Store listing name/branding for the RN app ("Mandela — School" vs "Mandela
   Staff").
4. Region for first production deploy (Nairobi-hosted VPS vs EU region + CDN).
5. Brand website domain plan: root vs `app.` split, and whether `/stories` ships
   at launch or as a fast-follow after two pilot schools.
6. Site languages at launch: English only vs English + Kiswahili toggle from day one.
