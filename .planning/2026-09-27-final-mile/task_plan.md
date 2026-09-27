# Final mile — web platform close-out (2026-09-27)

Owner directive: "then start working with the full skills policy active" —
everything left on the system except the (parked) Expo app. Source list:
the 2026-09-27 gaps review, cross-checked against code (not just trackers).

## Order (ponytail: reuse-first, cheapest-first within each track)

1. **Board pack PDF** — reuse `web/pdf.ts` (pdfkit streams exist for report
   card + statement). Endpoint `GET print/pdf/board-pack`, admin/principal
   only. Content: term identity, money (billed/collected/still-to-collect),
   attendance %, staff activation counts, approvals/tasks pending, discipline
   7d, audit-count-as-activity. Audit entry. UI link on Insights (+ health
   page action).
2. **One-click full export** — `GET admin/export` (admin only). Ponytail
   answer to "your data leaves with you": JSON of every table (respecting
   nothing secret — it IS the data, admin-gated + audited) streamed as one
   `.json` download. NOT pg_dump (no psql on the API host contract); tables
   enumerated from information_schema, ORDER BY name for determinism.
   Web proxy + Settings → Board & BOM (or Users?) link: "Download all data".
3. **Security sweep** —
   a. audit-coverage: every POST endpoint writes an audit row (script scans
      controller + audit_log action values; report gaps),
   b. staff without passwords (`login_hash IS NULL`) count,
   c. login throttle + rate limits verified live (bad pw x6 → locked),
   d. security headers audit (helmet config present? report),
   e. RLS suite re-run (`pnpm --filter @mandela/api test:rls`).
4. **Perf gate** — `.freebuff/perf-gate.mjs`: TTFB of `/app` + pulse API on
   simulated 3G (Node-side latency + ~400kbps/400ms RTTC profile), then
   50-concurrent mixed read load (pulse + health + learners + invoices)
   against the PROD build (`next build` + `next start -p 3101`, API dev ok —
   measure like-for-like, record numbers in gate output + DEV-PHASES).
   Thresholds from PLATFORM-PLAN §10: TTFB < 800 ms; load: p95 < 800 ms,
   0 errors @ 50 VUs.
5. **Deploy checklist** — `docs/DEPLOY-CHECKLIST.md` (env vars from OPS-RUNBOOK,
   TLS/Caddy, PWA device check, Daraja registration, WhatsApp meta creds,
   backups cron, money smoke, first-run provisioning order).
6. **Demo scratch cleanup** — stale joiners (p6joiner*, gate counters/drivers
   pending), teacher e2e scratch approvals decided 'rejected'... NO: decided
   rows are history; delete only NEVER-used junk (p6joiner* staff, pending
   gate approvals older than the demo ones). Careful: keep gate-verified
   demo accounts with passwords (counter/driver/p6 accounts are demo value).

## Gates
- typechecks (api+web) · RLS 5/5 · phase3/5/6/7 regression if endpoints touched
- browser pass 390/1536 on any new UI · budget check after new pages
- perf gate numbers recorded · DEV-PHASES + this plan updated

## Status (2026-09-27)
- Board pack PDF ✅ (`print/pdf/board-pack`, admin/principal, %PDF verified live)
- Full export ✅ (`admin/export`, 106 tables, 633 kB, teacher 403, audited)
- Security sweep ✅ 8/8 — found + fixed: `/admin/health` missing admin gate;
  `createHomework` missing audit row. RLS 5/5 after fixes.
- Perf gate ✅ 6/6 — **and it caught a real deadlock**: nested pool acquires
  (`latestStaffNotice` ×10 role pulses, `collectionByClass` inside `insights`)
  self-deadlocked the 5-client school pool under ≥5 concurrent requests →
  every route wedged. Fixed by passing the session client (POOL LAW comments),
  plus a 10s acquire-deadline guard in `withSession` so any future nested/
  leaked acquire fails loudly in seconds instead of hanging the school.
  Post-fix: 5075 reqs / 338 rps / p50 128ms / p95 234ms / 0 errors / instant
  recovery. TTFB 3G-corrected: login ≈438ms, /app ≈481ms, pulse ≈436ms.
- Deploy checklist ✅ `docs/DEPLOY-CHECKLIST.md` (ordered pre-flight, references
  OPS-RUNBOOK; provenance gates + perf baseline recorded).
- Demo scratch cleanup ✅ 38 gate-joiner staff deactivated (rows kept for
  history); counter/driver 49371701 pair + all seeded demo logins kept.
  Health page now reads 11 on books / 11 started / 0 pending.
- Board-pack link ✅ on School Health header (screenshot-verified, zero
  overflow); `/api/pdf?kind=board-pack` proxy streams %PDF authed.
- Regression gates after the deadlock fix: completion 20/20, phase3 24/24,
  phase5 36/36, phase6 40/40, phase7 44/44, RLS 5/5, web+api typechecks green.

## Skills honored
ponytail (reuse pdf.ts; export = data already in rows), caveman, security-auditor
(sweep rules), k6-load-testing (thresholds shape), postgresql-optimization
(indexes already in; measure, don't tune blind), verification-before-completion,
planning-with-files (this file).
