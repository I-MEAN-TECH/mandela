# Findings — Phase 3 recon (2026-09-25)

## Schema facts
- `perm_matrix(module_key, role, owns, sees, landing)` — 022 seeds; 037 adds dorm_parent/janitor/librarian/patron/hod. `setPermCell` enforces ONE landing per role going forward. Landing seeds: admin→today, principal→today (but 022 also seeds people.landing=true for principal — resolver must be deterministic), bursar→money, counter→money, teacher→none, hod→academics, dorm_parent/janitor/librarian/patron→operations.
- `staff_duty(staff_id, duty_key, label, scope_id, appointed_by, effective_from/to)` — duty_key 'principal' = the Principal hat. Claim functions (037/038/039/040) already `INSERT INTO staff_duty (staff_id,'principal','Principal',...)` when also_principal=true.
- Guardian OTP login exists: `resolveGuardianLogin(db, phone)` via `app_login_guardian` definer → token {kind:'guardian'}. RLS `app_guardian_learner_ids()` via learner_guardian — guardian home auto-shows linked children (no new read code needed; linking is the only gap).
- `message` table (001): guardian_id, learner_id, channel message_channel('whatsapp','sms','both'), state message_state DEFAULT 'queued'. Talk worker `sendQueued` picks state='queued' every 10s, sends via providers (simulate|meta), marks sent/failed. Welcome message = just an INSERT INTO message with channel 'whatsapp'.
- `learner_guardian(learner_id, guardian_id, relationship, is_primary)`.

## Auth/session seams
- `resolveStaffLogin` returns { token, staff{id,full_name,role}, needsPassword (login_hash null) }.
- `withRlsSession(client, {userId, role, guardianId?}, fn)` — SET LOCAL ROLE mandela_app + GUCs.
- `whoami` returns staff role + email; no duties/landed info yet.

## Web app seams
- `/app/page.tsx` — roleKey = guardian?'parent':role; hardcodes isAdmin = ['admin','principal'].includes(role); renders AdminPulse/StaffHome/GuardianHome. No role redirect yet (C1 target).
- Admin dashboard component: `frontend/apps/web/src/app/app/AdminPulse.tsx`.
- `requireSession()` in lib/api.ts — the seam for interstitial redirect (C2).
- Demo: `admin@demo.mandela.school` no-password dev login; code MANDELA-A3XKG48N.

## Controller facts
- web.controller.ts :82 login/staff (throttle 5/15min), :117 login/guardian, :143 whoami, :2679 outboxState, ~:1475 setPermCell zod, `requestLoginCode`/`verifyLoginCode` exist, `getOnboardingState` exists.
- queries.ts: upsertGuardian :2385 (dup-phone guard), importGuardians :2431, convertInquiry :2868 (INSERT learner_guardian :2913), upsertLearner guardian block :5004, setGuardianLink :6928, linkGuardianToLearner :6958, another guardian insert :7958 (switch-import?).

## Decisions so far
- Next migration = 041 (school). Naming: 041_onboarding_landing.sql.
- Keep radius small: single new SQL migration, one queries.ts block, one controller block, web: landingForRole helper + /app/start interstitial + api.ts fns + UI bits. Reuse existing primitives everywhere (ponytail).
