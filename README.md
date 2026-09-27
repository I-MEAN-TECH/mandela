# MANDELA — School Management, Rebuilt Simple

*"Education is the most powerful weapon which you can use to change the world."*
**Built for liberation. Designed for simplicity.**

Minimal modules, everything included, zero training required.
Five modules: **People · Money · Classroom · Talk · Insights** — plus optional
**Library Desk** and **Store Desk**, and the Alumni lifecycle.

📄 **Module-by-module spec, build status, and roadmap: [docs/MODULES.md](docs/MODULES.md)**
— what each module entails, what works today, what's next.

---

## Repository layout

```
mandela/
├─ frontend/            # the web app (Vercel)
│  └─ packages/
│     └─ ui/            # @mandela/ui — the shared design system
│        ├─ tokens.css          # single source of visual truth (light + dark)
│        ├─ tailwind.preset.ts  # Tailwind v4 preset (web + NativeWind)
│        └─ src/                # RoleShell, Button, Card/Money, Skeleton...
│
├─ backend/             # the API + services (VPS, Docker)
│  ├─ db/
│  │  ├─ school/        # per-school schema (001_schema.sql, 002_rls.sql)
│  │  ├─ control/       # provisioner control-plane schema
│  │  └─ powersync/     # offline sync rules (per-role scopes)
│  └─ docs/
│     └─ PROVISIONER.md # school provisioning pipeline spec
│
├─ mobile/              # Expo (React Native) app — parents + teachers (offline)
│  └─ README.md         # scope, stack, contracts with the design system
│
├─ desktop/             # Tauri 2 app — admin office, bursar, printing
│  └─ README.md         # scope, stack, packaging
│
└─ .agents/             # workspace skills (design, security, DB, Next.js...)
```

## Surfaces → hosting

| Surface | App | Hosted on |
|---|---|---|
| Web | Next.js 15 (App Router) | **Vercel** |
| API / backend | NestJS + Postgres 16 + Redis + MinIO + PowerSync | **Your VPS** (Docker) |
| Mobile | Expo (React Native), offline-first | EAS Build / stores |
| Desktop | Tauri 2 (wraps the web UI) | MSI/DMG/AppImage |

## Non-negotiables (enforced in code, not vibes)

1. **3-tap rule** — `RoleShell` limits every role to ≤5 tabs; adding a 4th
   level of nav is a product decision, not a dev shortcut.
2. **Money is integer cents** (`bigint`) everywhere — DB, API, UI (`Money`
   component). Never floats.
3. **One gold primary action per screen** — `Button variant="primary"`.
4. **Skeletons, never spinners** — optimistic updates on money/attendance.
5. **Permissions in the database** — per-school DB + RLS (layer 1–2), API
   guards (layer 3). The UI never *grants* rights, only reflects them.
6. **Consent is a ledger** — every parent consent is append-only and auditable
   (Kenya DPA).
7. **Hex lives in tokens.css only** — `pnpm check:theme` (runs before every
   build) fails when a hex color appears outside the theme allowlist, keeping
   the ink-and-paper system (and per-school theming) honest.

## Shared-token contract

All three surfaces import the same design tokens:

- Web: `frontend/packages/ui/tokens.css` + `tailwind.preset.ts`
- Mobile (NativeWind): `@mandela/ui/theme` (TS mirror) + same preset
- Desktop: renders the web UI — inherits everything

## Status

- [x] Market & competitor research (dossier in thread history)
- [x] Architecture decision (monorepo, VPS backend, Vercel frontend)
- [x] Database schemas (school + control-plane + sync rules)
- [x] Provisioner spec (`backend/docs/PROVISIONER.md`)
- [x] Design system v1 (`frontend/packages/ui`)
- [x] Monorepo tooling (pnpm workspaces + Turbo)
- [x] NestJS API skeleton + provisioner implemented (`backend/apps/api`)
- [x] End-to-end verified: bootstrap → provision school → RLS isolation test → live REST API
- [x] Next.js web app (`frontend/apps/web`) — landing, login, role shells, dashboards,
      attendance marking, money (collections + record payment + reconcile), homework,
      broadcast, insights, levies, reports, directory, settings, messages, profile,
      approve, class. Branding, nav labels, modules and the logo mark all come from the DB.
- [x] Design system v2: monochrome ink-and-paper palette sampled from `mandela.png`;
      chroma reserved for status; zero gradients (hard rule in `tokens.css`)
- [x] Module harness: 78-check end-to-end suite (`backend/apps/api/scripts/debug-modules.mjs`)
      + behavioral RLS suite; RLS enforced in the live API path (SET ROLE mandela_app)
- [x] Daily loop: per-school WhatsApp (Cloud API) + Email (SMTP) channels the admin
      connects in Settings → step-form, secrets encrypted at rest (AES-256-GCM),
      test-send buttons, and a morning digest per guardian (fees · homework · attendance)
      delivered by the talk worker — deduped, audited, channel preference per parent
- [x] Portable records (docs/RECORD-FORMAT.md): signed, chained, parent-owned
      fee statements / report cards / attendance summaries, verifiable offline
      via `node scripts/verify-record.mjs <file> --key-file <key>`
- [x] Money-lifecycle integrity checks: five SQL invariants (no orphaned payments,
      unique receipts, consent traceability, ledger closed, no double M-Pesa
      confirm) — enforced by the harness, surfaced in Settings
- [x] Admin dashboard verified end-to-end as the admin role: all 8 nav mains
      (Today · Money · Spend · People · Academics · Operations · Care · Insights ·
      Settings) and 36 sub-routes render live data; admin account seeded
- [x] School colors as data: `theme_json` brand tokens edited in Settings;
      `ThemeVars` injects `:root` overrides so every screen repaints from the DB.
      State colors stay product-owned (WCAG AA — color never carries meaning alone)
- [x] SaaS + Enterprise ready: one codebase, two modes — SaaS (wildcard subdomains,
      per-school DBs, control-plane tiering/fleet/metering) and Enterprise standalone
      (`deploy/` pack: docker-compose + Caddy TLS with on-demand custom-domain ask,
      per-tenant PWA manifest, env-tuned pools). Tenant resolution matches exact
      custom domains first, slugs second; `deploy/README.md` documents the scaling
      path to 1M+ users
- [ ] CBC assessment capture + report cards (schema exists, screens pending)
- [ ] WhatsApp delivery worker · M-Pesa Daraja integration
- [ ] better-auth integration (login, phone-OTP for parents)
- [ ] WhatsApp bot v1 · Expo app (`mobile/`) · Tauri shell (`desktop/`)
- [ ] Transport module + driver dashboard (last parked role)

## Quick start (dev — no Docker needed)

```bash
pnpm install
pnpm bootstrap:db        # starts embedded Postgres, sets up control plane
pnpm provision:school    # creates + migrates + seeds the demo school
pnpm --filter @mandela/api test:rls   # proves data isolation between roles
pnpm dev                 # runs the API (PORT=4000)
pnpm seed:demo           # staff, learners, fees, payments, attendance, homework
pnpm trace:logo          # mandela.png -> scripts/logo-traced.json (SVG path)
pnpm seed:branding       # loads the traced logo + role nav into school_settings

# Then the web app (second terminal):
pnpm --filter @mandela/web dev   # http://localhost:3000

# Demo logins (dev — email match only, better-auth arrives in v2):
#   admin@ · principal@ · teacher@ · bursar@demo.mandela.school
#   guardians: phone 254733000001..5 (login with 0733000001 form)

# Provision a real school:
pnpm provision:school '{"name":"St Mary''s","slug":"stmarys","admin":{"name":"J. Doe","email":"jd@stmarys.ac.ke","phone":"254712345678"}}'
```

The dev database is a user-space Postgres 17 (no admin rights, no service).
On the VPS, `docker compose -f backend/docker-compose.yml up -d` replaces it.
If port 54329 is taken, set `DEV_PG_PORT` (see `backend/.env.example`).
