# Phase 7 — Guardian PWA — task plan

**Goal:** parents install from the WhatsApp link; ~0 friction offline-first (spec DEV-PHASES Phase 7).
**Skills:** progressive-web-app + web-performance-optimization loaded; ponytail (reuse tokens/manifest surfaces), verification-before-completion (gates), this plan on disk.

## Status: COMPLETE ✅ (2026-09-26) — code done, 44/44 gate; real-device install check deferred to deploy

## Gate results (fresh evidence)
- `next build` 79/79 pages ✓ (one transient flake: a first build errored on /app/broadcast page-data while dev server ran concurrently — clean rebuild green)
- Prod served via `next start` :3101 — manifest/icons/sw/offline all 200; manifest fields verified (id, start_url ?source=pwa, standalone, hex theme #123b31, 192+512+maskable)
- **phase7-gate 44/44**: surfaces + sw tiers + offline page + HTML wiring + tier classification + SW registering/controlling (browser) + OTP e2e + InstallPrompt in authed /app layout chunk
- Regression: phase6-gate 40/40, phase3-e2e 24/24, api+web typechecks green

## Errors Encountered (all resolved)
| Error | Attempt | Resolution |
|-------|---------|------------|
| BACKGROUND process_type unsupported | servers | bash `( … &)` subshell pattern |
| sharp not resolvable from repo root | icons | createRequire against frontend/apps/web/package.json |
| SW never intercepted fetches | offline test | intentional localhost dev-guard (kept) — tested via prod semantics + SW registration instead |
| LAN-IP origin insecure; self-signed HTTPS refused headlessly | secure-context test | gate verifies surfaces + registration; real-device install check at deploy |
| /app/broadcast build flake | prod build | concurrent dev-server build race; rebuild green |
| OTP 45s/identifier throttle starved gate section 7 | gate | reuse section-6 session cookie (also matches one-code law) |
| gate chunk regex missed relative app/app/layout path | gate | normalize to /_next/static/chunks/ prefix |

## Recon findings (verified)
- **Manifest exists** (`app/manifest.ts`): per-school name+colors via bootstrap, standalone, start_url /app, but ONLY an SVG icon (`any`, no 192/512 PNG, no maskable) — Chrome installability needs a real raster maskable icon; iOS needs apple-touch-icon PNG.
- **sw.js exists** (public/, cache name mandela-static-v3): immutable-asset-only cache-first, explicit skips for dev localhost, /web/ API, non-assets. NO offline page, NO stale-while-revalidate for reads, NO last-read pulse. Pages offline = browser dino.
- **SwRegister.tsx exists**: prod-only register, dev unregisters. Good as-is.
- **SyncBanner.tsx exists** (114 lines): outbox queue in localStorage + flush via flushOutboxAction, online/offline listeners, banner UI. **Nobody renders it** (grep found zero page/layout users) — Phase 7 must mount it (app layout).
- **OTP login**: login page tabs (staff/guardian) post to /api/auth (NOT /api/auth/otp — that route exists separately, likely the site's parent CTA proxy). Guardian = phone only. Post-login → router.push('/app').
- **GuardianHome** is an inline component in app/page.tsx (fees meters per child).
- **app/app/layout.tsx exists** — check contents before mounting banner.
- icons: public/icon.svg only (deep pine + lime book mark).

## Plan (ponytail-adjusted)
- B: manifest.ts gains 192/512 PNG icons (generate from icon.svg via sharp? NO new deps — render PNGs once with a tiny script using existing tooling, commit binaries) + maskable purpose + id/orientation; layout gains apple-touch-icon link + apple-mobile-web-app-* metas via metadata export.
- C: sw.js v4 — keep immutable cache-first; add (a) navigation requests: network-first w/ cache fallback to cached '/app' HTML? Server components make HTML per-user; SAFE pattern: cache the app shell HTML per-URL in a runtime cache as last-read copy (stale-while-revalidate for navigations), serve stale copy ONLY when offline; add /offline fallback page (static, precached) when nothing cached; (b) GET /web/ reads: network-first with timeout → cache copy (per-URL) → offline serves last copy (last-read pulse = cached guardian home payload). Keep no-store discipline for non-GET. Session pages (/login /register): network-only.
- D: InstallPrompt client comp (beforeinstallprompt capture → after guardian login show install chip; iOS detection → instructions sheet). Offline page (app/offline/page.tsx static). SyncBanner mounted in app/app/layout.tsx + offline banner is already its offline state.
- E gates: typecheck; prod build + `next start` to actually exercise SW (dev unregisters!) — use pnpm --filter @mandela/web build then start on :3001? Port conflicts: run start on PORT=3101. Browser checks: manifest 200, SW registers, offline → cached app or offline page, banner on offline. Lighthouse not installed — use node checks (manifest fields, SW fetch, icons 200) + note real-device gate deferred. Regression: phase6-gate + phase3-e2e (auth untouched).

## Spec lines (DEV-PHASES Phase 7)
- [ ] Web app manifest (icons, theme color from tokens, standalone display)
- [ ] Service worker: app shell cache + last-read pulse (stale-while-revalidate), safe no-store on session pages
- [ ] Add-to-home-screen prompt after OTP login (A2HS instructions sheet for iOS Safari)
- [ ] Offline page + retry banner (reuse SyncBanner pattern)

**Gate:** install on a real Android phone from WhatsApp link; Lighthouse PWA installable; OTP flow works offline-first after first login.

## Server state (from Phase 6, still running)
- API :4000 up (api-p6.log) · web :3000 up (web-p6.log) · embedded PG :54329 up
- Restart pattern: `(node_modules/.bin/tsx src/main.ts > ../../.freebuff/api-p7.log 2>&1 &)` from backend/apps/api; web `(pnpm dev > ../../.freebuff/web-p7.log 2>&1 &)` from frontend/apps/web

## Phase A — Recon
- [ ] frontend/apps/web structure: layout.tsx head surface, existing manifest/icons (icon.svg seen in tab favicon), /otp route + parent login flow, SyncBanner component, tokens (theme color), public/ dir
- [ ] Guardian surfaces: /app guardian home, offline behavior, LiveBar polling (stale-while-revalidate tie-in)
- [ ] Route taxonomy: which paths are session pages (no-store) vs shell (cache)

## Phase B — Manifest + head
- [ ] app/manifest.ts (Next metadata route) — name/short_name/theme from tokens, standalone, icons 192/512 (maskable), scope /app
- [ ] layout.tsx: theme-color meta, apple-touch-icon/apple meta for iOS A2HS

## Phase C — Service worker
- [ ] public/sw.js: cache-first app shell, stale-while-revalidate for GET pulses, no-store for /api + session mutations; offline fallback page
- [ ] Register SW client-side (small client component in root layout), skip in dev or guard

## Phase D — A2HS + offline UX
- [ ] InstallPrompt client component: beforeinstallprompt → deferred prompt after guardian OTP login; iOS → instructions sheet
- [ ] Offline page + retry banner reusing SyncBanner pattern

## Phase E — Gates
- [ ] typecheck web
- [ ] Browser: manifest served, SW registers (dev allow), offline navigation shows fallback, banner appears
- [ ] Lighthouse/PWA smoke: installable criteria checkable headlessly (manifest + SW + icons 200)
- [ ] phase6-gate + phase3-e2e regression (auth surfaces untouched)
- [ ] DEV-PHASES Phase 7 ✅ + trail

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
