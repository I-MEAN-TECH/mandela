# Mandela — Module Specification & Build Status

> The single source of truth for what every module **is**, **entails**,
> **does today**, and **still needs**. Status markers:
> ✅ working end-to-end · 🟡 partial (works, missing depth) · ⚪ specified, not started · 🔮 future.
>
> Two hard product rules every module must obey:
> 1. **No hardcoding** — every label, tab, module card, fee, roster and number comes from the school database (`school_settings` + school tables).
> 2. **Ink & paper only** — color carries meaning (green=paid/present, amber=attention, red=overdue/absent), never decoration. Zero gradients.

> **Module map note:** the Admin dashboard's complete sector coverage — all 35 modules with statuses, cards/forms/charts specs and the phased build order — now lives in `docs/ADMIN-BLUEPRINT.md`. That document supersedes the module map in `ADMIN-DASHBOARD.md` §2.7 (5-tab rule amended to 7 nav groups).

**Demo DB reality check (2026-09):** 3 staff (bursar, teacher, principal — no admin row yet), 6 learners, 1 class, 5 guardians, 1 term. Every dashboard reads real data; the small dataset is why screens look minimal, not missing code.

---

## The six role dashboards (from `school_settings.nav_json`)

| Role | Tabs | Dashboard status |
|---|---|---|
| Bursar | Today, Collect, Reconcile, Levies, Reports | ✅ all tabs live |
| Teacher | Today, Mark, Homework, Messages, Class | ✅ all tabs live |
| Principal | Today, Approve, Insights, Broadcast, Directory | ✅ all tabs live |
| Admin | Today, Money, Spend, People, Academics, Operations, Care, Insights, Settings (8 mains, 028 seeds) | ✅ all mains live; admin account seeded (Njeri Kamau) |
| Parent (guardian) | Home, Pay, Homework, Messages, Profile | 🟡 Home + Pay deep; Homework/Messages/Profile shallow |
| Driver | Route, Manifest, Done | ⚪ no transport tables — deliberately not faked |

Shell: persistent left ink rail (icon rail on narrow screens, full labels ≥768px), white gliding active pill, live clock + LIVE data bar, route fade, count-up numbers, scroll reveals. `AppShell` lives in `/app/layout.tsx` so the nav never disappears.

---

## Module 1 — People (identity & relationships)

**What it entails:** staff register, learner register (CBC-friendly), guardians and their relationships to learners, classes, staff directory, per-role profiles.

**Tables:** `staff`, `learner`, `guardian`, `learner_guardian`, `class`, `academic_year`, `term`

**Works today (✅):**
- Staff directory screen (`/app/directory`) — name, role, contacts, classes taught, active flag
- Learners list API + People screen with class filter; roster API per class
- Class roster on teacher's Class tab (own classes only, via RLS)
- Guardian profile screen (own children, contacts, WhatsApp opt-in)
- RLS: guardians see ONLY their children; teacher sees own classes; bursar+ see all

**Still needs:**
- Learner 360 view: admission docs, photo, guardians, fee balance, attendance history in one profile (⚪)
- Guardian self-service editing of contacts/opt-ins (⚪ — currently read-only)
- Staff onboarding flow: invite, deactivate, role change with audit (⚪)
- Class management: create/edit classes, move learners between classes with history (⚪)
- Bulk import (CSV) of learners/guardians (⚪)

---

## Module 2 — Money (fees, payments, reconciliation)

**What it entails:** fee structures per class/term, fee items billed to learners, optional items behind guardian consent, payments (cash / bank / M-Pesa), receipts, pending-payment reconciliation, levies oversight, collection reports.

**Tables:** `fee_structure`, `fee_item`, `consent`, `payments`, `mpesa_txn`, `receipts`

**Works today (✅):**
- Record payment (Collect tab): learner picker, method, amount in integer cents, auto receipt number, audit-logged — verified in browser and harness
- Money screen: billed/collected/outstanding KPIs, collections-by-class table with meters, payments ledger
- Reconcile screen: pending payments queue (bank slips), one-tap confirm (audit-logged) — write path verified live
- Levies screen: fee structures + consent status from DB
- Reports screen: term collection totals + payment-method mix
- Integer-cents everywhere; guardians see only their children's fees (RLS-verified); teachers see zero money rows
- The landing page's live pulse ("collected today") reflects confirmed payments automatically

**Still needs:**
- **M-Pesa Daraja integration** (STK push + C2B callback → `mpesa_txn` → auto-confirm → receipt) — tables exist, integration ⚪
- Fee structure editor for bursar (currently seeded only) (⚪)
- Receipts PDF/print layout + SMS receipt (⚪ — receipt numbers are data already)
- Part-payment plans, sibling discounts, scholarships (⚪)

**Money integrity (✅):** `GET /web/admin/integrity` runs five lifecycle
invariants per school (no orphaned payments · receipts unique · optional fees
consent-traceable · collected ≤ billed per term · no double M-Pesa confirm).
Enforced by the harness (module 9) and surfaced in Settings → Money integrity.
Term-end statements ship as **signed portable records** — see Module 4/8 and
docs/RECORD-FORMAT.md.

---

## Module 3 — Classroom (attendance, homework, CBC assessment)

**What it entails:** daily attendance in two taps per learner, homework assignment with due dates and submissions, CBC assessment recording (strands, sub-strands, exam types, grades), report cards.

**Tables:** `attendance` (partitioned by month, unique per learner/day), `homework`, `homework_submission`, `assessment`

**Works today (✅):**
- Mark screen: roster from DB, present/late/absent/excused chips, live counts, save = upsert (re-marking updates, never duplicates — migration 007 unique index; verified 6 learners → exactly 6 rows)
- Homework: assign to a class (subject/title/body/due) via teacher; homework list; guardian home shows "coming due"
- Attendance data powers: teacher dashboard, staff dashboards, Insights 7-day chart, landing pulse
- RLS: teachers write only their classes; guardians read their children only

**Still needs:**
- **CBC assessment capture** — `assessment` table + grade computation exist in schema; no screens yet (⚪). This is the biggest gap vs the product promise.
- Homework submissions: learner/guardian view + teacher marking (tables exist, screens ⚪)
- Attendance register history view (per class per day, editable retroactively with audit) (🟡 data exists, no editor)
- Absence notifications to guardians (⚪)
- Term report card (scores + attendance + teacher remark) — depends on assessment capture (⚪)

---

## Module 4 — Talk (announcements, messages, WhatsApp)

**What it entails:** school→guardian announcements (WhatsApp-first with SMS fallback), per-guardian message ledger with delivery states, homework notifications, template management.

**Tables:** `announcement`, `message`

**Works today (✅):**
- Broadcast screen (staff): title/body/urgency, persisted to DB, appears instantly in announcements feeds everywhere
- Messages screen: staff see the delivery ledger; guardians see their inbox (RLS)
- Announcements feed on every dashboard; live watcher refreshes when new ones arrive
- Landing page quote/hero and guardians' announcements all DB-driven

**Works today (✅ added):**
- **Per-school channels + daily loop** — admin connects WhatsApp Cloud API
  (phone number ID + token) and SMTP email in Settings → Daily loop (a 3-step
  wizard with test-send buttons, docs/SIMPLICITY.md); secrets are AES-256-GCM
  encrypted at rest (`channel_config`, migration 033) and never returned by
  the API (write-only)
- **Morning digest** — one message per guardian per school day (fees balance ·
  homework due this week · yesterday's attendance),Africa/Nairobi-timed,
  deduped (`digest:<date>:<guardian>`), audit-logged; delivered WhatsApp-first
  with email for parents who prefer it (`guardian.pref_channel`, self-service
  on the Profile screen)
- Verified end-to-end: digest queued → sent in simulate mode; live providers
  activate the moment the admin pastes real credentials and hits Test

**Still needs:**
- Audience targeting (all / class / one guardian) — audience JSON column exists, UI ⚪
- SMS fallback when a guardian isn't on WhatsApp (`sms_fallback` flag exists) (⚪)
- WhatsApp template registration per school (provisioner stub exists) (⚪)
- Two-way messaging (guardian replies) (🔮)
- Delivered/read webhooks (state machine already carries `delivered`/`read`) (⚪)

---

## Module 5 — Insights (the school's health)

**What it entails:** cross-module analytics — collection rate, attendance trend, WhatsApp coverage, per-class comparisons, audit trail for leadership.

**Works today (✅):**
- Insights screen: active learners, collection rate (with meter), parents-on-WhatsApp %, money collected, 7-day attendance chart, per-class collection table
- Audit log infra: append-only partitioned `audit_log` with entries on payment record/confirm/settings change (007 policy work)
- Live watchers: dashboards refresh themselves when school data changes (hash polling)

**Still needs:**
- Audit trail screen for principal/admin (data exists, UI ⚪)
- Portable records: signed fee statements / report cards / attendance summaries
  that parents own and anyone can verify offline — **implemented** (✅):
  `GET /web/records/:learnerId/:kind` issues a `mandela.record.v1` envelope
  (HMAC-SHA256, chained via `prev_hash`, `record_export` ledger); verify any
  record with `node scripts/verify-record.mjs <file> --key-file <key>`. Spec:
  docs/RECORD-FORMAT.md. Parent-facing download button + PDF rendering (⚪)
- Attendance-vs-collection correlation per class (🟡 raw data present)
- Fee-defaulter list with contact actions (⚪)
- Term-over-term comparison (needs a second real term of data) (⚪)
- Export (CSV) for ministry reporting (⚪)

---

## Module 6 — Settings / Admin (the school edits itself)

**What it entails:** school identity as data — name, tagline, hero line, motto, quote, module cards, per-role navigation, prime questions, contacts, logo — plus admin-level user management.

**Works today (✅):**
- Settings screen: read-only for most, **write for principal/admin** — name, tagline, motto, contacts, quote, modules, nav all editable and audited
- Every change immediately re-renders landing + shell (bootstrap is re-fetched per request)
- Logo is a traced SVG path stored in `school_settings.logo_svg_path` (data, not an asset)
- Role guards verified: bursar write → blocked; principal write → works
- **School colors editor (✅):** `theme_json` brand tokens (primary + deep brand) edit via swatch pills in Settings; bootstrap/settings filter them to hex strings and `ThemeVars` injects `:root` overrides so every screen — login included — repaints from the DB. State colors (ok/warn/danger) stay product-owned (WCAG AA: color never carries meaning alone). Every change audit-logged; empty theme = product default.

**Still needs:**
- Logo upload/replace flow (regenerate the trace from a new PNG) (⚪)
- Term/academic-year management UI (⚪)
- Per-school theming: brand colors ✅ (editor above); per-token fine-tuning beyond the two brand surfaces (🔮)

---

## Module 7 — Desks (library, store, transport) — ⚪ schema-first, no UI

**What it entails:** the physical-asset desks. `library_item`/`library_copy`/`library_loan` (counter-managed loans), `stock_item`/`stock_movement` (store kitting), transport (routes, buses, boarding points, manifests — **no tables yet**).

**Status:** library + stock tables exist with RLS; no screens, no endpoints. Driver dashboard deliberately parked until transport tables are designed. This is the next big build after CBC assessment.

---

## Platform (cross-cutting, all ✅ unless noted)

- **Tenancy:** one Postgres cluster, one DB per school, subdomain → DB via control plane; provisioner runs checksummed migrations, grants, seeds idempotently (backend/docs/PROVISIONER.md)
- **Security, three layers:** per-school DB isolation → RLS as `mandela_app` role with session GUCs (migration 007 made this real in the API path) → NestJS role checks + zod validation. Behavioral RLS suite + 61-check module harness (`backend/apps/api/scripts/debug-modules.mjs`) guard it
- **Sessions:** HMAC-signed cookie tokens (guardian phone login normalizes 07/01/+254 formats); better-auth + OTP is the v2 path
- **Liveness:** LiveRefresh hash-polling (15s, pauses when tab hidden) + landing HeroPulse (12s) + ticking clock; real DB change detection, not fake timers
- **Design system:** `@mandela/ui` — tokens (ink/paper ramp sampled from the logo, zero gradients), KpiCard/Meter/Delta/DataTable/SerifHeader/Button/Card, motion primitives (Reveal, CountUp, NavPill) — mirrored to `theme.ts` for the future NativeWind mobile app
- **Curriculum as configuration (migrations 008–010):** `curriculum`, `curriculum_level`, `learning_area`, `assessment_scheme` tables + seeded packs (`cbe`, `844`, `british`) — any school, any curriculum (docs/CURRICULUM-ARCHITECTURE.md); classes attach to a ladder via `class.level_id`; assessment/report rendering reads scales as data
- **Known gaps:** demo email-match login (no passwords/OTP), one dev tenant, audit UI missing, tests = harness + RLS suite (no unit-test layer yet)

---

## Suggested build order (what makes the demo most real, soonest)

1. **CBC assessment capture + report card** — the module parents feel most; schema is waiting
2. **Admin account + audit trail screen** — completes governance story
3. **WhatsApp delivery worker** — turns the Talk module from ledger to real messaging
4. **M-Pesa Daraja STK/C2B** — turns Money from recorded to automatic
5. **Transport tables + driver dashboard** — the last parked role
6. Bulk billing + CSV import — removes the "6 learners" demo smallness when onboarding a real school
