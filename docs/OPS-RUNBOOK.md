# OPS RUNBOOK - Mandela school management

The "a real school can run on this" checklist: deploy, back up, keep secrets
out of the school database, and know how to restore. ASCII only.

---

## 1. Environment (all secrets are env vars, never DB rows)

| Var | Purpose |
|---|---|
| `POSTGRES_HOST/PORT/USER/PASSWORD` | hosted Postgres (Neon/Supabase/RDS). When `POSTGRES_HOST` is set, the embedded dev server never starts. |
| `WEB_SESSION_SECRET` | HMAC secret for session tokens. Set a long random string in prod - the dev default is public. |
| `WEB_DEFAULT_TENANT` | fallback school slug for hostless requests. |
| `WHATSAPP_PROVIDER` | `simulate` (dev) or `meta` (WhatsApp Cloud API). |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Meta credentials for the Talk worker. |
| `DARAJA_VALIDATION_TOKEN` / `DARAJA_SHORTCODE` | Safaricom Daraja C2B callback guard + paybill. |

## 2. First deploy

```bash
# 1. provision the cluster + schools (idempotent)
pnpm --filter @mandela/api bootstrap:cluster
pnpm --filter @mandela/api provision:school
# 2. apply migrations to every school DB
pnpm --filter @mandela/api migrate
# 3. build and run
pnpm --filter @mandela/api build && pnpm --filter @mandela/web build
node backend/apps/api/dist/main.js        # API on :4000
node frontend/apps/web/.next/standalone/server.js   # or `next start`
```

HTTPS: terminate TLS at Caddy/Nginx in front of both services. The API
trusts `x-forwarded-for` for the Daraja throttle and `x-mandela-host` for
tenant resolution - pass both through the proxy.

## 3. Staff passwords (auth hardening)

- Passwords are scrypt digests on `staff.login_hash` (migration 031).
- A staff member sets their own via the account menu: **Set password**.
  The write is audited (`staff.password.set`).
- **In production, every staff account must have a password.** The dev
  escape (empty password works when NODE_ENV !== production) exists ONLY
  so the seeded demo stays clickable. To enforce: ensure the seed granting
  `demo` never runs against a real school DB, and audit:

```sql
SELECT email FROM staff WHERE active = true AND login_hash IS NULL;
```

- Login throttling: 5 failed (ip+email) pairs lock the pair for 15 minutes
  (`login_throttle`).

## 4. Talk (WhatsApp) worker

- Provider is `simulate` by default: queued -> sent locally, no network.
- Flip `WHATSAPP_PROVIDER=meta` + token + phone number id to send real
  messages. Failures land on `message.error` + `provider_note`; the state
  machine, dedupe and audit are unchanged.
- The worker ticks every 10s inside the API process (main.ts) - no extra
  service to babysit.

## 5. Money Rails - Daraja C2B

1. Safaricom Daraja -> C2B -> Register URL:
   - Validation URL: `https://<host>/web/auth/daraja/c2b`
   - Confirmation URL: same endpoint.
2. Set `DARAJA_VALIDATION_TOKEN` to the token Daraja shows you.
3. A callback lands as a **suggestion** in Money -> Confirm & Rails - the
   bursar confirms in one tap. Nothing auto-writes (manual-first law).
4. Replays are dead via `mpesa_txn.checkout_request_id` UNIQUE; junk floods
   are throttled per IP; the endpoint always answers `{ResultCode:"0"}` so
   Daraja never retry-storms.

## 6. Backups

```bash
BACKUP_DIR=/var/backups/mandela ./scripts/backup-school.sh
# cron: 15 2 * * *  cd /srv/mandela && BACKUP_DIR=/var/backups/mandela ./scripts/backup-school.sh >> /var/log/mandela-backup.log 2>&1
```

- Per-school `pg_dump | gzip`, integrity-probed (decompresses + contains a
  dump header), 14-day rotation (`KEEP_DAYS` to change).
- **Restore drill** (do it once a quarter):

```bash
gunzip -c backups/mandela_demo-YYYYMMDD-HHMMSS.sql.gz | \
  psql -h $PGHOST -p $PGPORT -U mandela -d mandela_restore_test
# then: SELECT count(*) FROM learner;  -- and compare with prod counts
```

- "Your data leaves with you": the backup IS the export. Hand a school
  their latest dump on exit - it restores into any Postgres.

## 7. Money-path smoke (run after every deploy)

```bash
node backend/apps/api/src/scripts/smoke-money.mjs
```

Walks record -> confirm -> statement -> collections -> report dataset and
exits non-zero on any broken link. CI can run it against staging.

## 8. Health & monitoring

- `GET /web/pulse` - public term/DB heartbeat (no session).
- API boot logs `[talk] delivery worker started`; worker errors log per
  school and never crash the process.
- Watch the audit trail (Insights -> Audit & Switching) - a silent audit
  log during a school day means something is wrong.
