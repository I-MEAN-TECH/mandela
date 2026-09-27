# Phase 4 — Onboarding wizard UI (admin) — task plan (2026-09-25)

## Spec (docs/DEV-PHASES.md Phase 4)
- Wizard component on `/app` for admins with steps incomplete (uses `getOnboardingState`)
- 5 steps wired to EXISTING primitives: school profile → curriculum pack → open term → fee structure (+apply) → learners CSV import (reuse CsvFilePicker)
- Progress card on the admin Pulse until 5/5; dismissible after completion
- Each step deep-links to its screen; returning shows saved state

**Gate:** brand-new school DB → wizard → 5/5 done → checklist disappears. Numbers verified in DB after each step.

## Gates already verified (Phases 1–3 re-check, 2026-09-25)
- API + web typechecks green; site build 17/17 (Phase 2); RLS 5/5 (Phase 1)
- Landing regression: `/` → 307 → `/app`
- Phase 3 E2E `.freebuff/phase3-e2e.mjs`: 24/24 PASS

## Key facts from recon
- `getOnboardingState(dbName, principal)` EXISTS in web queries — returns
  `{ profile_done, pack_code, term_open, structures, learners, steps_done }`.
  Steps booleans: [profile_done, pack_code!=null, term_open, structures>0, learners>0].
- Controller endpoint for it: TBD (check `web.controller.ts` for `onboarding`) — if missing, add `GET web/onboarding/state`.
- Web api.ts: add `getOnboardingState()` server helper (read pattern).
- UI primitives to REUSE (ponytail: no new writes):
  - school profile → `/app/settings` SettingsForm (`updateSettingsAction`)
  - curriculum pack → `/app/academics/curriculum` CurriculumClient (`setCurriculumPackAction`)
  - open term → `/app/settings` TermsCalendar (`upsertTermAction`)
  - fee structure → `/app/money/fees` FeesClient (`upsertFeeStructureAction` + `applyFeeStructureAction`)
  - learners CSV → `/app/people/learners` ImportClient (`importLearnersCsvAction`, CsvFilePicker)
- Admin Pulse: `frontend/apps/web/src/app/app/page.tsx` isAdmin branch; card
  family: `Card`/`CardHead`/`StatusPill` from `@mandela/ui`; Reveal wrapper used.

## Steps
1. [ ] Recon: controller endpoint for onboarding state; settings fields the
       profile step needs (name/county/phone); ImportClient props.
2. [ ] API: expose `GET /web/onboarding/state` if missing.
3. [ ] Web: `getOnboardingState()` helper in lib/api.ts.
4. [ ] UI: `OnboardingWizard.tsx` client card on admin Pulse (only when
       steps_done < 5): 5 rows with done/undone state, deep links, refresh on
       return; dismissible ONLY after 5/5 (spec) — dismiss state in
       localStorage `mandela_onboarding_dismissed`.
5. [ ] Wire into `page.tsx` admin branch (fetch state; render when admin &&
       steps_done<5 && !dismissed).
6. [ ] Verify: typechecks; browser pass on demo admin (demo has 5/5 → card
       hidden; verify card VISIBLE by temporarily pointing at a fresh state —
       use the dismiss/undismiss path + a scratch check with steps<5).
7. [ ] Fresh-school gate: create scratch tenant DB (like e2efresh pattern),
       run wizard steps via API primitives, verify steps_done increments in DB.
8. [ ] Mark Phase 4 ✅ in DEV-PHASES with trail; close planning files.

## Risks
- Demo tenant already 5/5 → wizard invisible; must verify visible-state via
  fresh/simulated incomplete state (scratch DB or stubbed check) per gate.
- Don't duplicate existing setup screens — wizard is a deep-link checklist,
  NOT new forms (ponytail: reuse > new).
