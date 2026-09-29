# DEV PHASES — Platform Build Queue (working doc)

> The execution tracker for `docs/PLATFORM-PLAN.md` (the spec). This doc is the
> **queue we work from**: phase → slice → checkbox → gate. Update the checkboxes
> as work lands; never build anything that isn't a line here (or add the line
> first). Companion queue: `docs/BUILD-PHASES.md` covers the Admin-app module
> modules; this doc covers the platform (auth, site, role dashboards, mobile).
>
> Gates every slice must pass: `pnpm --filter @mandela/web typecheck` ·
> `pnpm --filter @mandela/api typecheck` · RLS suite (`test:rls`) after any
> migration/permission change · browser pass at 390 px and 1536 px · audit
> entry written for every new write path.

---

## Legend & rules

- `[ ]` not started · `[~]` in progress · `[x]` done · `(🔮)` parked.
- One phase ships alone; do not start a phase before the previous phase's gate passes.
- Decisions are locked in PLATFORM-PLAN (RN/Expo + PWA confirmed 2026-09-25;
  admin may hold the Principal hat). Re-litigating them mid-phase = bug.
- The design theme never changes: `@mandela/ui` components only, ink-and-paper law.

---

## Phase 1 — Auth & join codes  *(the keystone — everything hangs off it)* ✅ 2026-09-25

Goal: anyone can self-serve an account and land on the right school with the right role.

**Backend slices**
- [x] Migration 036: `user_role` enum + `dorm_parent`, `janitor`, `librarian`, `patron`, `hod` (own txn — enum values can't be used in the adding txn)
- [x] Migrations 037/038/039/040: `school_settings.join_code` (Crockford base32 `MANDELA-XXXXXXXX`) + control-DB `school.join_code` routing mirror; `app_generate_join_code()`; definer register functions; regenerate
- [x] `POST /web/auth/register-school` — claims the freshly provisioned tenant (ADOPTS the password-less provisioner seed; last-principal guard gets a claim-aware escape); returns session + join code; gated by `PROVISION_TOKEN`
- [x] `POST /web/auth/register-staff` — validates code → staff row with chosen role (admin blocked) → session cookie
- [x] `POST /web/auth/school-by-code` — school name only; per-IP rate limit; identical answer for bad-format and unknown (no enumeration)
- [x] Rate limits per IP + per code + per regen; audit entries: `staff.register`, `school.claimed`, `school.code.regenerated`
- [x] `perm_matrix` seeds for the 5 new roles (operations/academics-landing per §5)
- [x] BONUS fix (pre-existing blockers found by the fresh-school E2E): provisioner now creates school DBs `ENCODING 'UTF8'` (WIN1252 cluster broke 021+ on every fresh DB) and 024's NULL `nav_json` aggregate hardened

**Frontend slices**
- [x] `/register` page: ink/paper split matching login; door step → account step (10-role card grid, 72 px cards) → code step (auto-uppercase, onBlur lookup shows school name) → done (staff: "You're in"; admin: code card with Copy)
- [x] Admin branch: school name + *"I am also the principal"* → `staff_duty` hat → success screen shows join code + copy button
- [x] Staff branch: code entry → validated school name shown → join → dashboard
- [x] `POST /api/auth/register` route handler (proxy; relays API `set-cookie`)

**Gate (all passed 2026-09-25):** fresh provision → claim (seed adopted, principal hat) → join as teacher AND as `dorm_parent` → login → whoami per role → second claim refused → weak pw/dup email/bad role rejected → regenerate code (old dies, new resolves). RLS suite green. Web + API typechecks green. Browser pass at 1536 px and 390 px (door → grid → code → done). Test tenants/rows cleaned up.

---

## Phase 2 — Brand website  *(the brand, not a page)* ✅ 2026-09-25

Goal: `mandela.<tld>` tells the story and converts; ships independently of the app.

- [x] Scaffold `frontend/apps/site` (Next.js 15.5.4 static, all 17 routes prerendered ○) importing `@mandela/ui` tokens (same tokens.css + Tailwind v4 bridge as the product)
- [x] Shared site chrome: nav (5 items + Sign in + Get started), footer (4 cols), mobile drawer (48px targets)
- [x] Home `/` — brand hero, phone-first parent CTA, two staff doors, proof strip, 6 module rows, one-day adoption band, 12-role chips, pricing teaser, final CTA
- [x] `/product` (anchored 6-sector tour) · `/for-schools` (fee-gap ROI math + day-0/day-1 story + data ownership) · `/for-teachers` (two-taps pitch) · `/for-parents` (live WhatsApp digest sample + code CTA)
- [x] `/pricing` (3 tiers per-learner, M-Pesa billing, FAQ) · `/about` (mission, the name, beliefs) · `/contact` (WhatsApp-first) · `/legal` (privacy, learner-data/DPA, terms, SLA)
- [x] `/start` — three doors routing into the product
- [x] SEO/perf pack: per-page OG + Twitter cards, sitemap.xml, robots (search open, AI-training bots blocked), SoftwareApplication JSON-LD, static HTML, First Load JS ≈ 102 kB, zero client JS on content pages
- [x] EN/SW toggle skeleton: dictionary + `t()` with EN fallback, LangToggle in nav/drawer (localStorage), SW strings for chrome/doors/parent CTA ready
- [x] Product boundary via `appLinks.ts` (`NEXT_PUBLIC_APP_ORIGIN` in prod) + same-origin `/otp` proxy rewrite (no CORS surface; parent CTA posts the product's OTP shape, verified live)

**Gate (passed 2026-09-25):** static build green (17/17 pages), all routes 200, deep-links resolve on the product (:3000/register, /login), parent OTP flow works end-to-end through the proxy, browser pass at 1536 px and 390 px (drawer, toggle, 48px targets, no horizontal overflow), typecheck green. Lighthouse run deferred to deploy (needs prod origin).

**Landing removal (2026-09-25, owner decision):** the site owns ALL public presentation — the product's own landing page is gone (`frontend/apps/web` `/` → redirect to `/app`; `HeroPulse.tsx`, `/api/pulse` route, `/web/pulse` endpoint + `getPulse`/`PublicPulse` removed). Public marketing links point at the site; the app is auth-gated only.

---

## Phase 3 — First-login onboarding & doors wiring — ✅ DONE (2026-09-25)

Goal: the 1-day adoption path works end to end, unattended.

- [x] Post-login interstitial for un-landed staff: role confirm + school name + "Go to my dashboard" — `/app/start` (`StartClient.tsx`); shows role label, allows self role-flip before landing (undo included), then "Confirm & go" lands via `POST /web/me/land`
- [x] Landing resolution: read `perm_matrix.landing` per role → redirect — `resolveLanding()` in web queries (ONE landing per role, deterministic fallback `/app` when none/multiple seeded); `/app` page redirects landed non-leaders to their role landing (admin/principal stay on Pulse)
- [x] Admin-Principal hat: registration checkbox writes `staff_duty` principal hat; Pulse shows Principal sections toggle (spec §5, §6.1) — §6.2 KPI card + `PrincipalHatToggle` (browser-verified ON shows card, OFF hides it); duty row `effective_from`/`effective_to` dated today
- [x] Guardian link code *(owner decision 1)*: one-time code issued at admission (`app_admit_learner` mints `ML-XXXXXXXX` per guardian, reused until used); parent OTP login then shows the child; wrong code refused with human message
- [x] Welcome WhatsApp message on first join — `app_admit_learner` queues `message` kind `welcome` (dedupe `welcome:<guardian>:<learner>`) carrying the `/login` PWA link + family code; talk worker sends queued rows

**Gate (2026-09-25):** `.freebuff/phase3-e2e.mjs` — **24/24 PASS** against the live API on the demo tenant: admin (start state, hat toggle, admit-with-link → code issued → welcome queued), teacher (register → un-landed → interstitial data → self role-flip + undo → confirm+land → landed staff cannot self-flip), guardian (OTP login → linked child on home → wrong code refused). RLS suite green after 041; API+web typechecks green.

Implementation trail: migration `041_onboarding_landing.sql` (`staff.joined` + `joined_at`, `guardian.link_code` + `link_code_issued_at`, `app_generate_link_code()`, `app_resolve_landing()`, `app_admit_learner()` — plpgsql OUT-param names collide with columns, ALWAYS qualify, the 040 trap hit twice), endpoints `me/start|me/land|me/principal-hat (GET+POST)|guardian/link-code|learner/admit|staff/joiner-role`, UI `app/start/*`, `PrincipalSections.tsx`, `PrincipalHatToggle.tsx`, `DirectAdmissionForm.tsx`, `LinkChildCard.tsx`.

---

## Phase 4 — Onboarding wizard UI (admin) — ✅ DONE (2026-09-25)

Goal: a fresh school finishes setup without a manual; resume-able.

- [x] Wizard component on `/app` for admins with steps incomplete (uses `getOnboardingState`) — `OnboardingWizard.tsx` on the admin Pulse; reads the existing `GET /web/admin/onboarding` state probe (`profile_done`, `pack_code`, `term_open`, `structures`, `learners`, `steps_done`)
- [x] 5 steps wired to existing primitives — the wizard is a deep-link checklist, not new forms: school profile → `/app/settings` (SettingsForm), curriculum pack → `/app/academics/curriculum`, open term → `/app/settings` (TermsCalendar), fee structure (+apply) → `/app/money/fees` (FeesClient), learners CSV → `/app/people/learners` (ImportClient + CsvFilePicker)
- [x] Progress card on the admin Pulse until 5/5; dismissible after completion — hidden at 5/5 until dismissed (localStorage `mandela_onboarding_dismissed`, per-admin); dismiss only appears when done
- [x] Each step deep-links to its screen; returning shows saved state — card re-renders from the state probe on every Pulse load

**Gate (2026-09-25):** fresh scratch tenants (`mandela_p4gate6` API + `p4browser` browser): `.freebuff/phase4-gate.mjs` walks the five steps through the REAL endpoints on a freshly provisioned DB — `steps_done` 1→5 verified after each step, DB numbers checked (`fee_structure=1`, re-apply after CSV import bills the imported learners `fee_item=2`, guardians auto-created). Browser: login → Phase-3 interstitial → Pulse shows wizard 1/5 → deep link → real Settings form save → back on Pulse reads 2/5; demo Pulse (5/5) shows NO card. 22/22 pass.

Bug found by the gate and fixed: `/api/auth` login route never forwarded the tenant, so non-default schools could never sign in through the browser — now mirrors `hostToTenant()` and sends `x-mandela-host` (verified live against `p4browser`).

Implementation trail: `frontend/apps/web/src/app/app/OnboardingWizard.tsx`, `page.tsx` admin branch fetch + render, `lib/api.ts` `getOnboardingState()` (backend shape: flat booleans + `steps_done`; the stale api.ts duplicate with a `steps[]` shape was removed), `api/auth/route.ts` tenant forwarding.

**Gate:** brand-new school DB → wizard → 5/5 done → checklist disappears. Numbers verified in DB after each step.

---

## Phase 5 — Role dashboards, wave 1 (existing roles) — ✅ DONE (2026-09-26)

Goal: teacher, bursar, principal, counter, driver each get their "Today" (spec §6).

- [x] `rolePulse(dbName, role)` queries — `backend/apps/api/src/web/rolePulse.ts`: five query blocks (teacher/bursar/principal/counter/driver), same shape discipline as adminPulse, every read inside the session's RLS context (`withSession` now shared/exported from queries.ts), every list LIMIT-capped (heatmap ≤40 rows, 10-day strip, confirmations ≤6, arrears ≤5, funnel ≤5 stages, stops ≤12, manifest ≤40)
- [x] `perm_matrix.landing` seeds for the 5 roles; RoleShell `roleNav` extended — migration 042 (counter+driver → `today`), migration 043 (bursar `money`→`today`; teacher had no landing and resolves to `/app` = their Today too); RoleShell gained `counter` (§6.5 tabs incl. Messages for driver); seed-branding + demo nav_json got counter tabs
- [x] Teacher Today *(activation role)*: first-run = ONLY the mark roster (page.tsx renders MarkButtons in place of the dashboard — nothing precedes activation, §6.3); after marking, KPIs (present/expected, homework 7d, unmarked assessments, messages-today signal), today's timetable slots, WeekdayHeatmap of my class (last 10 marked days), my duty
- [x] Bursar Today: collected today/term vs billed KPIs, pending confirmations feed (oldest first), rails suggestions (state='suggested'), largest-arrears ladder, 7-day SparklineStrip; primary action → Collect/reconcile deep links
- [x] Principal Today: health KPIs (attendance %, incidents 7d, approvals pending, collection % read-only), approvals feed oldest-first + Review link, 14-day attendance SparklineStrip, absences-by-class + incidents-by-class lists, duty roster today
- [x] Counter Today: visitors-on-site/calls/open-inquiries/fee-inquiries KPIs, FunnelBars by stage (enum-ordered), awaiting-checkout feed + Log-a-visitor deep link, today's events
- [x] Driver Today: trips/manifest/not-picked-up/bus KPIs, RouteStrip stops-with-states (text-first, no chart per §6.6), manifest list, route-affecting events
- [x] New chart components in `@mandela/ui` (`components/RoleCharts.tsx`, token-styled, motion reveal w/ reduced-motion + in-view failsafe, zero gradients, tabular numerals): **SparklineStrip**, **WeekdayHeatmap** (✓/L/✕/· green-amber-red), **FunnelBars**, **RouteStrip** (48px touch rows)

**Gate (2026-09-26):** `.freebuff/phase5-gate.mjs` — **36/36 PASS** on the demo tenant: seed logins for teacher/bursar/principal, counter+driver registered through the real join-code flow, all five pulses shape-checked, role-gating verified in BOTH directions (teacher denied bursar, principal denied driver, admin denied teacher), landing resolution asserted via `/me/start` (counter+driver land on their own Today). RLS suite green; API+web typechecks green. Browser pass per role at 390 px and 1536 px — zero horizontal overflow: teacher (first-run roster → marked 6 present + 1 late through the real UI → dashboard shows 6/7 + live heatmap; first-run gone after saving), bursar (all five cards + 7-day strip), principal (approvals/trend/absences/duty), counter (funnel/checkout/events + counter nav tabs render), driver (route strip + manifest empty states). Regression: Phase 3 E2E 24/24 after all changes.

Deviations (documented): teacher "messages unread" uses WhatsApp volume to the class's guardians today — no per-user read-state model exists yet; driver bus status shows the reg_no of the active bus on the route (no status field). Demo bursar password was reset to the documented "demo" (hash had drifted). The gate's join step is rate-limited (10/hour/IP) — repeated runs may see "Too many attempts"; that is the Phase-1 limiter working.

**Gate:** each role's first session completes its primary action in ≤ 2 taps from login; typecheck + RLS + 390/1536 passes per role.

---

## Phase 6 — New roles & admin team tools — ✅ DONE (2026-09-26)

Goal: all 12 roles live; admin can run the team from Settings.

- [x] RolePulse + Today for: dorm_parent (rollcall primary), janitor, librarian, patron, HOD overlay (teacher base + dept data) (spec §6.7–6.11)
- [x] Settings → **Team**: join code display/regenerate, pending joiners, role changes, duty hats list (spec §7.7)
- [x] Settings → **Permissions Matrix**: review + edit `owns/sees/landing` for all 12 roles (table UI exists — extended to new roles)
- [ ] Role home config (admin toggle of KPI cards per role) — stored as JSON on `perm_matrix` row *(optional; parked to 🔮)*
- [x] Broadcast to staff channels (announcements → staff audience; feeds roster/task fanout) — done in the system-completion run below (B1)
- [x] School health page: activation status per staff member — done in the system-completion run below (B2, `/app/settings/health`)

**Gate (2026-09-26):** `.freebuff/phase6-gate.mjs` — **40/40 PASS** on the demo tenant: all five wave-2 logins, each lands on their own Today (`/me/start` → landing `/app`), pulse shape checks + role-gating in BOTH directions (teacher denied dorm_parent/janitor/librarian/patron, bursar denied hod), primary actions through the real endpoints (dorm_parent takes rollcall, janitor files a repair via `admin/facilities/report`, librarian issues+returns a copy, patron awards house points), admin team tools (join code read + regen kills the old code, fresh joiner registered then role changed janitor→librarian, **next login resolves the new role**), perm matrix serves all 12 roles. RLS suite 5/5 after migration 044. API + web typechecks green. Regression: phase5-gate 36/36, phase3-e2e 24/24. Browser pass at 390 px and 1536 px — zero horizontal overflow on all five new dashboards + Team screen + teacher/bursar/principal/admin regressions.

Implementation trail: migration **044_phase6_roles.sql** (today-landings ×5 + RLS grants: dorm/dalloc/exeat/rollcall read + rollcall/laundry write for dorm_parent, repair read/insert for janitor, section*/house_points for patron, loan_counter + stock read for librarian, learner/attendance/assessment/homework/timetable/discipline lists gain the new roles; DPA surfaces untouched); `rolePulse.ts` gains dormParentPulse/janitorPulse/librarianPulse/patronPulse/hodPulse (teacherPulse refactored into teacherPulseInner so HOD reuses it in-session); controller `pulse/dorm_parent|janitor|librarian|patron|hod` + `GET admin/team` (teamOverview: join_code + joined/pending via staff.joined); `changeUserRole` + its zod enum extended to 11 roles; `awardHousePoints` guard + RLS gain patron; `@mandela/ui` RoleShell + DEFAULT_PRIME cover 12 roles, new **StandingsBars** chart (§8, house standings); web: 5 Today views in RolePulses.tsx, page.tsx routing, Team card (code + copy/regen + pending-start list) on Settings → Users & Duties, matrix pickers at 12 roles.

Deviations (documented): janitor "assigned to me" impossible (repair_report has no assignee — reported_by only) → KPIs are open/done-7d/structural/est-cost, and Mark-done stays leaders-only; dorm-parent clinic-visit feed dropped (clinic_visit RLS is DPA-strict principal+infirmary — kept closed); HOD department = the learning area they teach most (no dept entity); "teachers present" KPI became dept teacher count (no staff attendance model). HOD overlay hides when they teach nothing. Gate side-effects: demo join code was rotated by the gate run; wave-2 demo accounts (dormparent/janitor/librarian/patron/hod@demo.mandela.school, pw "demo") + p6joiner* pending rows now exist.

**Gate:** sign in as each new role and complete its primary action; admin can change a role and see the dashboard change on next login. ✅ (all proven in the 40/40 run)

---

## Phase 7 — Guardian PWA — ✅ CODE DONE (2026-09-26; real-device install pending)

Goal: parents install from a WhatsApp link; ~0 friction.

- [x] Web app manifest (icons, theme color from tokens, standalone display) — the per-school `manifest.ts` (name + derived theme from `school_settings.theme_json`) gained stable `id`, `?source=pwa` start_url, portrait, and a real icon set: 192/512 PNGs (rendered once from `icon.svg` with the in-repo `sharp`, no new deps) + a **maskable 512** (artwork in the 80% safe zone on the deep-pine field) + the SVG
- [x] Service worker: app shell cache + last-read pulse (stale-while-revalidate), safe no-store on session pages — **sw v4** (`mandela-static-v4` + `mandela-reads-v4`): tier 1 immutable assets cache-first; tier 2 `GET /web/*` reads network-first, every success updates the per-URL last-read copy (offline serves it — the guardian sees their last fees/homework with no signal); tier 3 navigations network-first with a 4s timeout → last-read copy → precached `/offline`; `/login` `/register` `/api/auth` and all writes NEVER cached (money hits real errors; SyncBanner owns the queue). Prod-only registration unchanged (dev unregisters — unhashed chunks would go stale)
- [x] Add-to-home-screen prompt after OTP login (A2HS instructions sheet for iOS Safari) — `InstallPrompt.tsx` in the app shell: captures `beforeinstallprompt` (one-tap Install), iOS gets the Share→Add-to-Home-Screen sheet, standalone-aware, dismissible for 7 days (localStorage); layout metadata gained `appleWebApp` + `apple-touch-icon`
- [x] Offline page + retry banner (reuse SyncBanner pattern) — static `/offline` (precached at install, zero-network render, retry link); the offline/queued-writes banner was already SyncBanner (flank #5) mounted in AppShell — verified live

**Gate (2026-09-26):** `.freebuff/phase7-gate.mjs` — **44/44 PASS** against the PROD build (`next build` 79/79 pages, served via `next start` on :3101): manifest fields + all four icons 200, sw v4 tier content, `/offline` session-free with retry path, HTML wiring (manifest link, theme-color, apple-touch-icon, apple-web-app metas), fetch-tier classification of real paths, SW verified **registering + controlling** the page, guardian OTP request→verify→session end-to-end, InstallPrompt confirmed inside the authed `/app` layout chunk. Typechecks green (api+web). Regression: phase6-gate 40/40, phase3-e2e 24/24.

**Deferred to a real device (owner action, by design headless-less):** the Android install from a WhatsApp link and a Lighthouse installability run need a deployed HTTPS origin (SWs require a secure context; localhost/LAN-IP plus self-signed HTTPS were tried — Chromium refuses the self-signed cert headlessly). The offline-first runtime behavior (last-read copies serving while offline) is exercised by the same code path the gate verifies; confirm on the phone at deploy time.

---

## System completion run (2026-09-26) — owner: park the app, finish the web system

Plan: `.planning/2026-09-26-system-completion/task_plan.md`. Order: Phase 6 loose ends → §7 Finish list → Phase 9 core. Phase 8 PARKED; Redis deferred until >50 schools (spec's own condition).

- [x] **B1 — Broadcast to staff** *(spec §7.7 #10; DEV-PHASES Phase 6 leftover)*: `audience` jsonb already existed on `announcement`; the fanout worker and `createAnnouncement` only knew `learners|class|all`. Added `{staff:true}` audience — migration **045_broadcast_staff.sql** (message rows for a staff audience are exempt from the NOT NULL guardian via a new nullable `staff_recipient uuid REFERENCES staff` + CHECK guardian-xor-staff-recipient; msg RLS lets any staff read rows addressed to staff), fanout inserts one message per active staff member, `createAnnouncement` accepts `audience: {staff:true}`, broadcast UI gains a Staff checkbox, staff pulses (teacher/bursar/principal/counter/driver + wave-2) surface the latest staff announcement in a Staff notices card, `listAnnouncements` filters by audience kind.
- [x] **B2 — School health page** *(§7.7 #11)*: `GET web/admin/health` + `/app/settings/health` (admin-only) — activation per staff member from `staff.joined` (041): started vs pending-start lists, per-role counts, hat load, audit entry on view. Pending-joiners card on Team remains the quick view.
- [x] **C10 — Term-scoped money on Pulses** *(§7 #2)*: bursar `collected_term_cents`, principal `collection_pct`, and the admin Pulse's collected figure now sum `payments` inside the CURRENT term (`paid_at BETWEEN term.starts_on AND term.ends_on`) — the all-time sum was the last stale number on the dashboards.
- [x] **C11 — Inline approvals/tasks on the Pulse** *(§7 #3)*: admin/principal Pulse approvals feed rows carry Approve/Reject server actions (`decideApprovalAction`), task rows carry Complete (`completeTaskAction`) — no navigation; feed refreshes via router.refresh().
- [x] **C12 — Timetable auto-layout** *(§7 #4)*: `POST web/admin/timetable/autolayout` — greedy per-class placement of each learning area's weekly periods into free (day, period) slots, teacher-conflict aware; button on the timetable screen (admin), audit `timetable.autolayout`.
- [x] **C13 — Server-side PDF** *(§7 #5)*: `pdfkit` (API package only) — `GET /print/pdf/report-card/:learnerId?term=` and `/print/pdf/statement/:learnerId` session-gated, ink-and-paper layout, streamed `application/pdf`; print pages link "Download PDF".
- [x] **D5 — Perf indexes** *(§9)*: migration **046_perf_indexes.sql** — `attendance(day, learner_id)`, `payments(state, paid_at)`, `audit_log(at DESC)`, `message(state, created_at DESC)`. RLS green after.
- [x] **D4 — role_pulse rollups** *(§9)*: migration **047_role_pulse.sql** (`role_pulse(role PK, payload jsonb, refreshed_at)`); talk-style 60s worker loop refreshes the eight school-wide role pulses per active school; pulse GETs serve the rollup when fresh (<90s), else compute live (fallback keeps every existing gate green). Teacher/HOD stay live (class-scoped RLS semantics don't survive a shared rollup).
- [x] **D9 — Bundle budget CI check** *(§9)*: `web/scripts/check-bundle.mjs` (wired as `pnpm --filter @mandela/web check:budget`) gzips each route's manifest chunks against a 200 kB budget and asserts `@mandela/ui` stays dependency-free; refuses to measure dev artifacts (`.next/BUILD_ID` guard — `next dev` chunks would false-fail). Measured on the prod build: 81 routes, 0 over (heaviest `/app/page` 165 kB).

**Gate (2026-09-26):** typechecks (api+web) green · RLS 5/5 after 045/046/047 · phase3-e2e 24/24 · phase5-gate 36/36 · phase6-gate 40/40 · phase7-gate 44/44 · completion-gate (new, `.freebuff/completion-gate.mjs`): staff broadcast lands a queued message per staff member + staff pulse shows the notice; health page returns started/pending split; term-scoped sums differ from all-time on seeded data (expected); inline approve/complete flips state; autolayout fills gaps without teacher clashes; PDFs stream `%PDF` bytes; role_pulse rollup serves a fresh pulse; budget check reports. Browser pass 390/1536 on the new surfaces, zero overflow.

**Re-verification (2026-09-27, live browser pass on the demo tenant):** inline-approval happy path driven through the real Pulse card — teacher-raised request approved with a typed reason, card list shrank 3→2 approvals in place with no error. That pass caught a real UI bug: PulseActions never called `router.refresh()` on success (comment promised it; DB row flipped both times but the card only updated on reload) — fixed in `PulseActions.tsx`, web typecheck green. `/api/pdf` proxy verified from the browser session: statement AND report-card return 200 `application/pdf`, `%PDF-` magic, inline disposition. `/app/settings/health` + `/app/broadcast` measured zero horizontal overflow at 390 px and 1536 px (per-element scan). `check:budget` re-run green on a fresh prod build.

**View mode — Cards ⇄ List on every section (2026-09-27, owner request):** every table/list surface in the app can now be read either as the designed card surfaces or as a compact ledger — the choice is the user's, persisted **per app section** (first two path segments, e.g. `/app/money` covers Money + its children) in localStorage (`mandela_view`). One mechanism covers all ~64 sections without touching them: `@mandela/ui` **ViewToggle** (dependency-free, inline SVG glyphs) in the AppShell topbar + `viewBootstrapScript` inlined in the root layout so a stored list view applies **before first paint** (no flash of cards; `<main suppressHydrationWarning>` absorbs the pre-hydration attribute, same external-state pattern as ThemeVars); a `useViewMode` hook in AppShell re-applies the choice on client navigations; the CSS layer in `globals.css` (`main[data-view="list"]`, ≥641 px only) flattens `[data-card]` surfaces (hook added to Card) into hairline ledger rows, tightens `[data-kpi]` tiles (hook added to KpiCard) while KPI strips KEEP their columns (grid collapse is `:has([data-card]):not(:has([data-kpi]))`-scoped), and disables the rise animation. Verified in the live browser: toggle renders + applies (computed border-radius 16px→0px, shadow→none), persists per section across reloads AND client navigations (money/people/inbox stores proven independently), console clean (hydration warning found and fixed), DataTable pages coexist (tables still scroll inside their card), zero horizontal overflow in BOTH modes at 390 px and 1536 px. Fixed a pre-existing 390 px overflow found by the pass: LearnerRoster header actions blew 8 px (search input now `w-36 sm:w-44`, actions `min-w-0`). Typechecks green; prod build + budget re-run: 81 routes, 0 over (top 166 kB, +1 kB for the feature).

---

## Phase 8 — Expo React Native app  *(stack CONFIRMED 2026-09-25; PARKED 2026-09-26 — owner: no app development until the web platform is fully finished)*

Goal: one app, staff + parents, offline-first, ≤ 25 MB, cold start ≤ 2 s.

- [ ] Monorepo app `frontend/apps/mobile` (Expo Router, Hermes, TypeScript path aliases shared)
- [ ] NativeWind wired to `@mandela/ui` tokens (theme parity check against web screenshots)
- [ ] Auth: password login (staff) + phone OTP (parents); join-code first-run reusing Phase 1 endpoints
- [ ] Offline core: SQLite store + MMKV prefs + device outbox → flusher (mirrors `sync_outbox` semantics; money writes online-only by law)
- [ ] Teacher Today + Mark attendance (the activation screen) · Bursar Collect · Guardian Home + Pay
- [ ] Expo Updates OTA channel (dev → prod)
- [ ] Size/perf budget pass: per-ABI APK, image audit, cold-start measurement on low-end profile

**Gate:** APK ≤ 25 MB download (≤ 15 MB per-ABI), cold start ≤ 2 s on low-end device profile, offline attendance round-trips cleanly on reconnect.

---

## Phase 9 — Performance & readiness floor

Goal: the speed promises in PLATFORM-PLAN §10 are enforced, not hoped for.

- [ ] `role_pulse` rollup tables per school, refreshed by worker (dashboards = one small read)
- [ ] Term-scoped money/attendance queries + indexes: `attendance(day, learner_id)`, `payments(state, paid_at)`, `audit_log(at DESC)`, `message(state, created_at)`
- [ ] Micro-cache (10 s) on pulse reads; brotli + static caching headers at the edge
- [ ] Object storage (S3-compatible) for learner photos & documents; presigned uploads; 128 px WebP thumbs
- [ ] Redis: register/OTP rate limits, pulse micro-cache, talk-worker queue *(only when > 50 schools)*
- [ ] Bundle budget CI check: web route JS < 200 kB gzip; ui package stays dependency-free

**Gate:** dashboard TTFB < 800 ms simulated 3G; load test 50 concurrent per school; RLS suite green after index/rollup migrations.

**Gate RUN (2026-09-27, final mile): 6/6 GREEN.** TTFB 3G-corrected
(400 ms RTT + payload @400 kbps): login ~438 ms, /app ~481 ms, pulse ~436 ms
(prod build on :3101). Load: 50 VUs × 15 s mixed reads (pulse/learners/insights/
statement PDF) = **5 075 reqs, 338 rps, p50 128 ms, p95 234 ms, 0 errors**,
instant recovery. Statement PDFs hold p95 249 ms under load.

The gate caught a **real deadlock**: role pulses and insights nested a second
pool acquire (`latestStaffNotice`, `collectionByClass`) inside their open
`withSession` transaction — at pool capacity (max 5/school) every request
wedged forever (15 BEGINs vs 10 COMMITs in the query trace; PG
`idle in transaction`, ClientRead). Fixed by passing the session client down
(POOL LAW comments in `queries.ts`), plus a 10 s acquire-deadline in
`withSession` so any future nested/leaked acquire fails loudly in seconds.
Post-fix numbers above; regression gates all re-green after the fix.

---

## Status board

| Phase | Name | Status | Owner notes |
|---|---|---|---|
| 1 | Auth & join codes | `[x]` | done 2026-09-25 — incl. fresh-provision encoding fixes |
| 2 | Brand website | `[x]` | done 2026-09-25 — EN/SW skeleton in, deploy needs NEXT_PUBLIC_APP_ORIGIN |
| 3 | First-login onboarding | `[x]` | done 2026-09-25 — 24/24 E2E, re-proven 2026-09-26 |
| 4 | Onboarding wizard UI | `[x]` | done 2026-09-25 — 22/22 on fresh tenants |
| 5 | Role dashboards wave 1 | `[x]` | done 2026-09-26 — 36/36, re-proven 2026-09-26 |
| 6 | New roles & team tools | `[x]` | done 2026-09-26 — 40/40; role-home config parked 🔮; broadcast-to-staff + health page delivered in the system-completion run below |
| 7 | Guardian PWA | `[x]` | code done 2026-09-26 — 44/44; real-device install check at deploy |
| 8 | Expo RN app | `[ ]` | PARKED by owner 2026-09-26 — finish the system first |
| 9 | Perf & readiness | `[~]` | rollups+indexes+budget done; **gate 6/6 run 2026-09-27** (p95 234 ms @ 50 VUs); left: micro-cache, object storage, Redis(>50 schools) |

### Final mile (2026-09-27) — close-out batch

- Board pack PDF (`print/pdf/board-pack`, admin/principal; link on Settings →
  School Health; streams through `/api/pdf?kind=board-pack` too).
- One-click full export (`GET admin/export`, admin-only, audited; Settings →
  "Download all data"; 106 tables JSON).
- Security sweep 8/8 — fixed en route: `/admin/health` now admin-gated;
  `createHomework` writes its audit row. RLS 5/5 after.
- Perf gate 6/6 (see Phase 9 note — the pool-deadlock postmortem).
- `docs/DEPLOY-CHECKLIST.md` — ordered launch pre-flight, references OPS-RUNBOOK.
- Demo tenant cleanup: 38 gate scratch staff deactivated (rows kept); demo
  logins (incl. counter/driver 49371701 pair) untouched.

### Data management clarity (2026-09-29) — complete

- [x] Default operational data sections to compact List mode while preserving
  dashboard Cards/KPIs/charts.
- [x] Add accessible search, field filters, result counts, and pagination to
  learner and payment ledgers; retain specialized filters already present in
  reports, exams, and audit history.

### Payment learner workspace handoff (2026-09-29) — complete

- [x] Open the full People/Learners workspace from the compact payment picker;
  retain clear per-row View, Edit, and archive/restore actions.

### Shared KPI card hierarchy (2026-09-29) — complete

- [x] Standardize KPI cards: icon at top-right, value at top-left, label and
  supporting detail beneath; preserve responsive and dark-anchor variants.

### KPI card surface interaction (2026-09-29) — complete

- [x] Make shared KPI cards square and add a reduced-motion-safe hover lift
  with a deeper shadow.

### Admissions list clarity (2026-09-29) — complete

- [x] Replace the horizontal admissions stage-board with one filterable list
  using existing inquiry fields and actions.

### Library desk column layout (2026-09-29) — complete

- [x] Stack Counter and Overdue cards vertically for a clearer library desk.
