# MANDELA — Deployment (SaaS + Enterprise)

One codebase, two modes. The difference is **data**, not code:

| | SaaS (online) | Enterprise (standalone) |
|---|---|---|
| Who runs it | Mandela platform, one VPS fleet | The school (or their IT partner), one box |
| Domain | `school.mandela.school` | The school's own: `portal.stmarys.ac.ke` |
| Branding | Per-school colors/logo (Settings) | **Full**: name, colors, logo, PWA app identity — all from their DB |
| Isolation | One Postgres, one DB **per school** (RLS defense-in-depth) | Their own Postgres instance |
| Control plane | `mandela_control` tracks every school, tier, usage | One row, `tier: dedicated` |
| Install | Self-serve signup → provisioner pipeline | `docker compose up -d` → 1 command → DNS |

## SaaS mode (the online product)

1. Provision a school (idempotent, resumable — see `backend/docs/PROVISIONER.md`):
   ```bash
   pnpm provision:school '{"name":"St Marys","slug":"stmarys","tier":"standard",
     "admin":{"name":"J. Doe","email":"jd@stmarys.ac.ke","phone":"2547XXXXXXXX"}}'
   ```
2. Wildcard DNS `*.mandela.school` → the VPS; Caddy (`deploy/Caddyfile`) terminates TLS.
3. Tenant resolution is automatic: exact `caddy_host` match first (future custom
   domains on shared hosting), then first-label slug. **No per-school config.**

## Enterprise mode (standalone, fully branded)

```bash
cp .env.example .env         # SCHOOL_HOST=portal.stmarys.ac.ke + secrets
docker compose up -d         # Postgres + API + Web + Caddy TLS
docker compose exec api node backend/apps/api/dist/scripts/provision-school.js \
  '{"name":"St Marys Junior School","slug":"stmarys","tier":"dedicated",
    "admin":{"name":"J. Doe","email":"jd@stmarys.ac.ke","phone":"2547XXXXXXXX"}}'
```
Point the school's DNS at the box. Caddy gets the cert automatically — for any
hostname **not** named in the Caddyfile it asks the API's `GET /web/tenant-check`
endpoint first, so certificates are only issued for schools that exist in the
control plane.

Full branding is already data: school name/motto/contacts/quote (Settings →
Identity), colors (Settings → School colors → every screen incl. login), the
PWA manifest (`/manifest.webmanifest` is generated per-tenant — the school's
name and colors become the installed app icon/title on parents' phones), and
nav labels. No code changes, ever.

## Scaling path (to 1M+ users)

The architecture is already per-school-DB; the knobs, in the order you turn them:

1. **Connections** — `PG_POOL_MAX_SCHOOL` × active schools must fit inside
   Postgres `max_connections`. Past ~40 busy schools on one node: put pgbouncer
   (transaction mode) between API and Postgres, raise its pool, keep app pools small.
2. **Vertical first** — one DB node comfortably serves hundreds of standard
   schools (school-day traffic is bursty, not flat). `db_node` in the control
   plane already models a fleet for when a node fills.
3. **Dedicated tier** — big schools pin to their own node (`tier: dedicated`,
   `api_pool`), same images, same pipeline.
4. **Hot standards** — `attendance` is already month-partitioned; `audit_log`
   partitioning rolls monthly. Partitions + per-school DBs keep every table small.
5. **Reads** — Next.js serves RSC pages with `no-store` only on data fetches;
   static assets and the PWA shell cache at Caddy. Add read replicas per node
   when Insights needs them (same resolver, `api_pool` routing).
6. **Web tier** — stateless (sessions are HMAC tokens); run N replicas behind
   Caddy whenever CPU, not DB, becomes the bottleneck.

## Operational floor (both modes)

- **Backups**: nightly `pg_dump` per school DB + control DB; weekly full cluster
  snapshot; retention per the school's Settings → Data policy (audit kept forever).
- **Migrations**: checksummed, append-only, applied by the provisioner — never
  edit an applied file.
- **Secrets**: only in `.env` (deploy) or the AES-256-GCM vault (`school_credential`,
  per-school WhatsApp/M-Pesa); never in school DBs, never in code.
- **Health**: `GET /web/pulse` (public, tenant-scoped), `/web/tenant-check`
  (Caddy TLS ask), API logs to journald/Docker.
