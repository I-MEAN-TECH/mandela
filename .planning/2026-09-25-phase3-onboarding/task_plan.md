# Phase 1/2 Gate Verification + Phase 3 Onboarding — Task Plan

**Goal:** Prove Phase 1 (auth + join codes) and Phase 2 (brand site) pass their gates with the full skills policy active, then build Phase 3 (first-login onboarding & doors wiring) per `docs/DEV-PHASES.md`.

**Project docs (law for WHAT):** `docs/DEV-PHASES.md` Phase 3 · `docs/PLATFORM-PLAN.md` §4–§6.
**Skills (law for HOW):** ponytail, caveman, verification-before-completion, planning-with-files + routing: security-auditor, whatsapp-cloud-api, database-design/supabase-postgres-best-practices, zod-validation-expert, tdd.

## Phase A — Gate battery for Phase 1 & 2 (verification-before-completion)

- [x] API typecheck green (`tsc -p tsconfig.json --noEmit` exit 0, 2026-09-25)
- [x] Web typecheck green (`tsc --noEmit` exit 0, 2026-09-25)
- [ ] Site build green (`pnpm --filter @mandela/site build`, 17/17 pages)
- [ ] RLS suite green (`pnpm --filter @mandela/api test:rls`)
- [ ] Landing-removal regression: `/` → 307 `/app` (already verified 2026-09-25, re-check after any restart)

## Phase B — Phase 3 recon (read before decide)

- [ ] Read `docs/PLATFORM-PLAN.md` §4–§6 (roles, perm_matrix, doors, landing)
- [ ] Read existing auth flow: `web.controller.ts` login/whoami, `queries.ts` JOIN_ROLES, `staff_duty` migration 036, register UI (`register-staff` payload incl. principal checkbox)
- [ ] Read `/app` root layout + `app/page.tsx` (Pulse) + login server actions to find the post-login seam
- [ ] Read talk worker (daily loop) for the welcome-WhatsApp seam
- [ ] Write findings to `findings.md`

## Phase C — Phase 3 build (one DEV-PHASES checkbox at a time)

- [ ] C1: `perm_matrix.landing` resolution — helper `landingForRole(role, duties)` + `/app/page.tsx` redirect per role
- [ ] C2: Post-login interstitial for un-landed staff (role confirm + school name + go-to-dashboard), `/app/start` route
- [ ] C3: Admin-Principal hat — registration checkbox → `staff_duty` principal row; Pulse Principal sections toggle
- [ ] C4: Guardian link code — one-time code at admission, link guardian↔learner, OTP login shows child
- [ ] C5: Welcome WhatsApp on first join via talk worker (incl. PWA/install link for guardians)

## Phase D — Gate run-through + docs

- [ ] Persona run-through: admin (create) < 3 min
- [ ] Persona run-through: teacher (join) < 3 min
- [ ] Persona run-through: guardian (OTP + linked child) < 3 min
- [ ] Typecheck + RLS + web typecheck green
- [ ] Mark Phase 3 ✅ in DEV-PHASES with trail; update progress.md

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
