# Phase 6 — New roles & admin team tools — task plan

**Goal:** all 12 roles live (spec §6.7–6.11) + admin team tools (§7.7: Team screen, Permissions Matrix).
**Spec:** docs/DEV-PHASES.md Phase 6 · docs/PLATFORM-PLAN.md §6.7–6.11, §7.7.
**Skills policy:** AGENTS.md — ponytail (reuse rolePulse/pulse-endpoint/RoleShell patterns), caveman replies, verification-before-completion (gates before any ✅), this plan on disk.

## Status: COMPLETE ✅ (2026-09-26) — Phase 6 done, DEV-PHASES updated

## Browser pass (fresh evidence, all zero horizontal overflow)
- dorm_parent 390 ✓ 1536 ✓ (rollcall + occupancy meters) · janitor 390 ✓ 1536 ✓ (queue) · librarian 390 ✓ 1536 ✓ (due feed + bars) · patron 390 ✓ 1536 ✓ (StandingsBars) · hod 390 ✓ 1536 ✓ (teacher base + heatmap, overlay hides when dept null)
- Team screen (admin, settings/users): join code + pending-start list at 390 ✓ 1536 ✓ (screenshot verified)
- Regressions: teacher 390/1536 ✓ (heatmap), bursar 390/1536 ✓ (strip + confirmations), principal 390/1536 ✓ (approvals), admin 390/1536 ✓ (Pulse)
- Login via real form worked for all; one flake: Enter-submit occasionally no-op'd after Fast Refresh — retried with click, not a product bug

## Gate results (fresh evidence)
- `pnpm --filter @mandela/api typecheck` ✅ · `pnpm --filter @mandela/web typecheck` ✅ (both after all edits)
- migrate on demo: `applied 044_phase6_roles.sql` ✅ (landings + 10 policies verified in DB)
- RLS suite 5/5 ✅ · **phase6-gate 40/40** ✅ · **phase5-gate 36/36** ✅ · **phase3-e2e 24/24** ✅
- Gate fixes found + shipped: teamOverview used non-existent staff.joined_at (COALESCE updated_at); awardHousePoints guard lacked patron; users-roles/change zod enum lacked 5 roles; register-staff returns cookie only (gate resolves joiner via roster); role change requires fresh login (token carries role).
- Demo DB now has wave-2 staff (dormparent/janitor/librarian/patron/hod @demo.mandela.school, pw "demo") + Dorm P6; join code was rotated by the gate (MANDELA-D3D4V275 as of last run) — demo README value stale.
- Pending-joiner rows accumulate with each gate run (p6joiner* un-landed staff) — harmless, they demo the pending list.

## Server state (post-restart 2026-09-26)
- API :4000 UP — `backend/apps/api` `(node_modules/.bin/tsx src/main.ts > ../../.freebuff/api-p6.log 2>&1 &)`, health via mapped-route log (no /healthz route; curl /healthz = 404 while up).
- Web :3000 UP — `frontend/apps/web` `(pnpm dev > ../../.freebuff/web-p6.log 2>&1 &)` (log path resolves to repo root .freebuff because cwd-relative `../../` from apps/web lands at repo root... actually lands at frontend/.freebuff? verify on next write; web:200 confirmed).
- Site :3100 DOWN (not needed for Phase 6).

## Phases

### Phase A — Recon ✅ DONE
Findings (all verified in source):
- rolePulse.ts: one exported fn per role, each opens `withSession(dbName, {userId, role}, c => …)`, LIMIT-capped lists. Template for Phase 6.
- Controller pulse endpoints at tail (lines 3420–3465): staff-only + exact-role check + rolePulse.<fn>(tenant.dbName, principal).
- **Team tools already exist**: `GET web/admin/users-roles` (usersAndRoles q4068), `POST web/admin/users-roles/change` (changeUserRole q4087 — hard-codes 6 roles, MUST extend to 12), `GET web/admin/perm-matrix` (q4123), `POST web/admin/perm-matrix/set` (q4136 — generic, new roles flow through as data), duties q4174/4190/4214 (`GET/POST admin/duties` routes at controller 1437–1520). Join-code regen: `POST web/auth/join-code/regenerate` (rate-limited). NO GET endpoint returns the current code → add `GET web/admin/team` (joinCode + counts).
- api.ts already exports getUsersRoles/changeUserRoleAction/getPermMatrix/setPermCellAction/getDuties/assignDutyAction/endDutyAction. Missing: pulse getters ×5, joinCode getter, regen action.
- Settings users screen (`settings/users/page.tsx` + UsersClient.tsx 320 lines): 3 cards (UsersTable w/ ROLES const 6 roles, PermMatrixTable = data-driven, DutiesBoard). Team = extend this screen with a JoinCodeCard + pending-joiner chips; extend ROLES to 12.
- page.tsx routing: rolePulse ternary at lines 95–100 + render branch 118–127; isWave1 line 55.
- RoleShell (ui/src/RoleShell.tsx): Role union + roleNav + rolePrimeQuestion — add 5 roles.
- perm_matrix: 037 seeded operations/academics landings for the 5 roles; 042/043 pattern = insert `('today', role, …) ON CONFLICT` + UPDATE old landing off. 044 mirrors this for 5 roles.
- RLS gaps to fix in 044 (policies are role-list `IN (...)`): dorm/dorm_allocation/hostel_rollcall/exeat_pass read + rollcall write lack `dorm_parent`; repair read/insert lacks `janitor`; repair UPDATE (mark done) lacks `janitor`; laundry write lacks `dorm_parent`; house_points write lacks `patron`; section* read lists lack `patron` (head-hat write paths already exist); library policies lack `librarian`; learner/attendance read lists lack `hod` (HOD overlay reads teacher base) — exact policy names verified during edit.
- Deviations logged: janitor "assigned to me" impossible (repair_report has no assignee — reported_by only) → KPIs become open/done-this-week/structural/est-cost; dorm-parent clinic-visit feed dropped (clinic_visit RLS is DPA-strict principal+infirmary-hat — keeping it closed wins); HOD dept = most-taught learning area from my timetable (no dept entity); staff have no attendance model → HOD "teachers present" KPI becomes dept teacher count.
- staff.joined (041) exists → "pending joiners" = staff with joined=false, surfaced via usersAndRoles + Team card.

### Phase B — Migration 044 (new-role landings)
- [ ] 044_phase6_landings.sql: perm_matrix landing seeds for dorm_parent/janitor/librarian/patron/hod (→ today)
- [ ] config.ts SQL_PATHS + provisioner SCHOOL_MIGRATIONS registration

### Phase C — Backend pulses + endpoints
- [ ] rolePulse.ts: dormParentPulse / janitorPulse / librarianPulse / patronPulse / hodPulse (teacher base + dept overlay)
- [ ] controller: GET web/pulse/<role> × 5 (role-gated same as wave 1)
- [ ] Team tools endpoints (admin-gated): GET admin/team (join code, pending joiners, roster, duty hats), POST admin/team/code/regenerate, POST admin/team/role (change staff role), POST admin/team/hat (add/remove duty hat)
- [ ] Permissions matrix endpoints if missing: GET admin/permissions, POST admin/permissions (owns/sees/landing per role)

### Phase D — Frontend
- [ ] RolePulses.tsx: DormParentToday, JanitorToday, LibrarianToday, PatronToday, HodToday
- [ ] page.tsx routing for the 5 roles (hod = teacher base + overlay)
- [ ] RoleShell roleNav + primeQuestion for dorm_parent/janitor/librarian/patron (hod reuses teacher nav)
- [ ] Settings → Team screen (join code card + regen, pending joiners approve?, roster w/ role change, duty hats list)
- [ ] Settings → Permissions matrix extended to 12 roles (edit owns/sees/landing)

### Phase E — Gates (verification-before-completion)
- [ ] pnpm --filter @mandela/api typecheck · @mandela/web typecheck
- [ ] RLS suite (backend test:rls) after migration
- [ ] phase5-gate 36/36 + phase3-e2e 24/24 regression
- [ ] Fresh gate: .freebuff/phase6-gate.mjs — register each new role via join code, pulse shape checks, admin team tools end-to-end (role change visible on next login, code regen kills old code)
- [ ] Browser pass 390 + 1536 per new role, zero horizontal overflow
- [ ] Update DEV-PHASES.md Phase 6 ✅ + trail; fix stale status board rows (3–6)

## Decisions
- (pending recon) Team role-change guard: cannot demote last admin/principal — mirror 039/040 last-principal guard.
- (pending recon) hod pulse = teacherPulse SQL + dept block appended; page.tsx renders teacher view + overlay card.
- Landing for all 5 new roles = `today` (matches §6.7–6.11 "Today" tabs; perm_matrix already seeded operations/academics per §5 — override to today like wave-1 did via new migration, not edit of old ones).

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| run_terminal_command BACKGROUND unsupported | server restart | use bash `( cmd > log 2>&1 & )` subshell pattern |
