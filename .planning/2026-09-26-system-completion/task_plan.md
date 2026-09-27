# System Completion — sequenced plan (2026-09-26)

## ✅ CLOSED 2026-09-27 — all items landed and verified

Final live pass (demo tenant, admin browser): C11 inline approval driven end-to-end through the real Pulse card (teacher-raised → typed reason → approved → card list refreshed in place, 3→2). The pass caught + fixed one bug: PulseActions omitted `router.refresh()` on success. C13 `/api/pdf` proxy verified from the session (statement + report-card, 200 `%PDF-`). Health + broadcast pages zero-overflow at 390/1536. D9 promoted to the repo as `web/scripts/check-bundle.mjs` + `check:budget` with a dev-artifact (BUILD_ID) guard; fresh prod build measures 81 routes, 0 over 200 kB (top 165 kB), ui dependency-free. Residual scratch rows (2 stale teacher "raise" approvals, old admin-raised scratch decisions) left in the demo tenant only. Gates on record: completion-gate 19/19, phase7 44/44, phase6 40/40, phase5 36/36, phase3 24/24, RLS 5/5, typechecks green.

## Follow-up (2026-09-27, owner request): View mode — Cards ⇄ List on every section ✅

`@mandela/ui` ViewToggle (dep-free) in the AppShell topbar; choice persisted per app section (localStorage `mandela_view`, scope = first two path segments); pre-paint bootstrap script in the root layout (no flash; `<main suppressHydrationWarning>`); CSS ledger layer in globals.css scoped `main[data-view="list"]` (cards → hairline rows, KPI strips keep columns via :has() guard, ≥641 px only). Covers all ~64 sections without per-page edits; DataTable pages unaffected. Browser-verified: persistence across reloads + client navs, per-section isolation, clean console, zero overflow both modes at 390/1536 (also fixed a pre-existing 390 px overflow on LearnerRoster header actions). Typechecks + prod build green; bundle budget 81 routes 0 over (top 166 kB).

**Scope:** everything left before the system is "fully finished". Phase 8 (Expo app) is PARKED by owner. Redis (P9 item 8) deferred until >50 schools per the spec itself. Real-device PWA install stays a deploy-time check.

**Order (agreed with owner via suggestion):** 6 loose ends → §7 Finish list → Phase 9 core.

## B — Phase 6 loose ends
- **B1 Broadcast to staff.** `announcement` table gains `audience` (already jsonb? verify) or reuse: spec says "announcements currently target guardians; staff channels needed for roster/task fanout". Minimal: add `audience text NOT NULL DEFAULT 'guardians'` CHECK IN ('guardians','staff','all') via migration 045; `POST /web/admin/broadcast` accepts audience; list filters by audience; staff see announcements on their Today (rolePulse feeds add latest staff announcement). Audit entry.
- **B2 School health page.** `GET /web/admin/health` (admin-only): per active staff — name, role, joined (041), last_seen (no session table? use staff.updated_at + message/audit presence honestly: joined + duties + created), KPIs (total/started/pending), render `/app/settings/health` page. Pending joiners list is the core signal; full roster with started/not.

## C — §7 Finish list
- **C10 Term-scoped money.** Bursar pulse `collected_term_cents` + admin pulse collected + principal collection_pct: constrain SUM(payments) to `paid_at >= term.starts_on AND paid_at <= term.ends_on` (current term). Keep billing side as-is (fee items are term-shaped already? verify fee_item columns; if not term-scoped, scope payments only and label honestly).
- **C11 Inline approvals/tasks on Pulse.** Admin+principal Pulse: approvals feed rows get Approve/Reject buttons (server actions → decideApprovalAction exists), tasks get Complete (completeTaskAction exists). Reveal-on-pulse, no navigation.
- **C12 Timetable auto-layout.** `POST /web/admin/timetable/autolayout` (admin): for each class, place each learning-area's weekly periods into (day, period) slots by level, avoiding teacher double-booking (simple greedy: iterate areas × required periods, pick first free slot). UI button on timetable page.
- **C13 Server-side PDF.** `pdfkit` (verify in tree, else add dep): `GET /print/pdf/report-card/:learnerId` and `GET /print/pdf/statement/:learnerId` (session-gated, term query) → application/pdf. Reuse reportData dataset.

## D — Phase 9 core
- **D5 Indexes (migration 045/046).** `CREATE INDEX IF NOT EXISTS idx_attendance_day_learner ON attendance(day, learner_id); idx_payments_state_paid ON payments(state, paid_at); idx_audit_at ON audit_log(at DESC); idx_message_state_created ON message(state, created_at DESC);` — RLS suite after.
- **D4 role_pulse rollups.** New migration: `role_pulse (school-scoped table per tenant: role text PK, payload jsonb, refreshed_at timestamptz)`. Worker loop (API process setInterval like existing workers) refreshes counter/driver/bursar/principal/dorm/janitor/librarian/patron pulses per school every 60s; pulse GET endpoints read the rollup when fresh (<90s) else compute (fallback keeps gates green). School-wide roles only — teacher/hod keep live reads (class-scoped RLS semantics).
- **D9 Bundle budget.** Script `scripts/check-bundle.mjs`: parse `next build` output sizes (or .next/app-build-manifest) → fail if any route First Load JS > 200 kB gzip-equivalent (use raw size / 2.5 heuristic? No — Next reports First Load JS already-gzipped estimates; compare against 200 kB raw number it prints). Wire as `pnpm --filter @mandela/web check:budget`.

## Gates (per batch)
- Typechecks, RLS after every migration, phase3/5/6/7 gates regression, browser 390/1536 on new UI (broadcast audience control, health page, inline actions, timetable button, PDF links), DEV-PHASES checkboxes + trails, plan file updated.

## Decisions
- Migrations: 045 = broadcast audience + role_pulse table + indexes? NO — one concern per migration per repo convention: **045 broadcast audience, 046 role_pulse table, 047 perf indexes** (order matters: C needs 045; D needs 046/047).
- pdfkit vs print-CSS: spec says server-side PDF explicitly → pdfkit, added to api package only.
