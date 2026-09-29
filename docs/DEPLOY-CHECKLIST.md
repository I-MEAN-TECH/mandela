# DEPLOY CHECKLIST - Mandela school platform

The ordered pre-flight for standing up a real school. Deep details live in
OPS-RUNBOOK.md - this is the launch sequence, in order, with the gates that
must be green before families touch it. ASCII only.

---

## 0. Provenance (before you touch a server)

- [ ] All gates green on the exact commit being deployed:
      completion-gate 20/20 - phase3 24/24 - phase5 36/36 - phase6 40/40 -
      phase7 44/44 - RLS 5/5 - perf-gate 6/6 - `pnpm -w typecheck` clean.
- [ ] Perf baseline to beat (2026-09-27, prod build, 50 VUs): p95 234 ms,
      0 errors, 338 rps mixed reads; TTFB 3G-corrected: login ~438 ms,
      /app ~481 ms, pulse ~436 ms. If the new host is slower than this,
      stop and investigate - do not tune blind.

## 1. Host wiring

- [ ] Postgres reachable and NOT the embedded dev server
      (`POSTGRES_HOST` set -> embedded never starts).
- [ ] `WEB_SESSION_SECRET` set to a long random string (dev default is public).
- [ ] `CONTROL_PLANE_TOKEN`, `PROVISION_TOKEN`, and `VAULT_MASTER_KEY` are distinct 32+ character secrets, stored outside browser-accessible configuration.
- [ ] `WEB_ORIGIN` lists the real site + product origins (comma-separated).
- [ ] `NEXT_PUBLIC_APP_ORIGIN` set so site links into the product are absolute.
- [ ] `WEB_DEFAULT_TENANT` = the school slug this deployment serves.
- [ ] TLS terminated at Caddy/Nginx; proxy passes `x-forwarded-for` AND
      `x-mandela-host` through to the API (tenant resolution breaks silently
      without the second one).
- [ ] Enable Brotli/gzip + long-lived immutable caching for `/_next/static`
      at the edge (Next serves hashed assets; headers are an edge config).

## 2. Provision + migrate (order matters)

```bash
pnpm --filter @mandela/api bootstrap:cluster   # idempotent
pnpm --filter @mandela/api provision:school
pnpm --filter @mandela/api migrate             # every school DB
```

- [ ] `_mandela_migrations` in each school DB matches the repo's SQL_PATHS.
- [ ] The dev seed granting password "demo" / empty-password logins has NOT
      run against this school. Verify:

```sql
SELECT email FROM staff WHERE active = true AND login_hash IS NULL;
```

      Must return zero rows (OPS-RUNBOOK §3).

## 3. Money rails

- [ ] Daraja C2B registered (validation + confirmation URL -> the one
      `/web/auth/daraja/c2b` endpoint), `DARAJA_VALIDATION_TOKEN` +
      `DARAJA_SHORTCODE` set. Callbacks land as bursar suggestions; nothing
      auto-writes.
- [ ] Money smoke after first boot and after EVERY deploy:

```bash
node backend/apps/api/src/scripts/smoke-money.mjs
```

## 4. Talk (WhatsApp)

- [ ] `WHATSAPP_PROVIDER=meta` + `WHATSAPP_TOKEN` +
      `WHATSAPP_PHONE_NUMBER_ID` set (worker ticks inside the API; no extra
      service). Dev stays `simulate`.

## 5. Backups + data exit

- [ ] cron the backup script (OPS-RUNBOOK §6), verify one archive
      decompresses and contains a dump header.
- [ ] Backup storage is encrypted, replicated off-host, and restore credentials are restricted to operations staff.
- [ ] Restore drill done once before launch, quarterly after.
- [ ] Hand-over promise: latest dump on exit (or Settings -> "Download all
      data" for the JSON export), plus board pack PDFs from Insights.

## 6. Device + field verification (needs the public HTTPS origin)

- [ ] PWA install on a real Android: open authed /app from a WhatsApp link,
      install from the menu, launch offline, check installability
      (Lighthouse PWA) on the prod origin - localhost proves nothing.
- [ ] Guardian OTP flow over real SMS/WhatsApp path (no dev toasts).
- [ ] Zero-overflow pass on the two worst pages at 390 px (Money, People).

## 7. Watch for (ops notes)

- [ ] POOL LAW: never hold one pool client while acquiring another from the
      same pool - nested acquires deadlock at capacity. `withSession` now
      fails loudly after 10 s (see db/pool.ts). If you ever see
      "school pool exhausted", treat it as a code bug, not a size knob.
- [ ] `PG_POOL_MAX_SCHOOL` (default 5) x active schools must fit inside the
      Postgres max_connections budget, or front it with pgbouncer in
      transaction mode.
- [ ] A silent audit trail during a school day means something is wrong.
- [ ] `GET /web/pulse` is the public heartbeat; alert on its absence.

## 8. Go-live sequence

1. Deploy behind TLS with simulate/`demo`-free config, run §2-§5 smokes.
2. Admin logs in first: Settings -> Team, staff set passwords, join codes out.
3. Classes + fee structures before invoices; invoices before guardians.
4. Guardians onboard from their WhatsApp link (phase-7 flow).
5. Day-2: check audit trail activity, rollup freshness (Settings -> Health),
   backup archive exists, Daraja test payment confirmed in one tap.
