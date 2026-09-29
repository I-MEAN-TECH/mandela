# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all confirmed release-blocking tenant, authentication, control-plane, dependency, and runtime-hardening gaps.

**Architecture:** Browser sessions become opaque signed references to a tenant-bound server-side session record. The API resolves and validates the tenant before loading a current principal, then enters the existing RLS transaction. The Caddy edge owns host forwarding; direct API traffic cannot select a tenant or access the provisioning controller.

**Tech Stack:** NestJS 10, TypeScript, PostgreSQL 17, Next.js 15, Caddy, Docker Compose, Zod.

## Global Constraints

- Preserve current staff password and guardian OTP user journeys; remove phone-only guardian login.
- Every production secret is required and validated at process startup.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, 12-hour absolute lifetime.
- Do not return session tokens in JSON responses.
- Use parameterized SQL and RLS-scoped reads/writes for tenant data.
- Production dependencies must have zero critical or high `pnpm audit --prod` findings.
- All new behavior begins with a failing executable regression test.

---

### Task 1: Tenant-bound revocable sessions

**Files:**
- Modify: `backend/db/control/001_schema.sql`
- Modify: `backend/apps/api/src/web/queries.ts`
- Modify: `backend/apps/api/src/web/web.controller.ts`
- Test: `backend/apps/api/src/scripts/test-security.ts`

**Interfaces:**
- Produces `issueToken(session)` and `verifyToken(token)` whose claims include `sid`, `tenant`, `exp`.
- Produces `loadPrincipal(tenant, token)` which rejects wrong tenant, expiry, revocation, inactive users, and stale staff roles.

- [ ] Write a security test that creates a tenant-A session and asserts it is rejected when used for tenant B.
- [ ] Run `pnpm --filter @mandela/api security:test`; confirm it fails because current tokens lack tenant/session state.
- [ ] Add a control-plane `web_session` table keyed by opaque UUID, with tenant slug, principal type/id, role snapshot, issued/expiry/revoked timestamps.
- [ ] Make issuance persist a session and sign only its id, tenant slug, and expiry; load and validate its database row before each request.
- [ ] Re-run `pnpm --filter @mandela/api security:test`; confirm cross-tenant access is rejected.

### Task 2: Safe credentials and session lifecycle

**Files:**
- Modify: `backend/apps/api/src/web/queries.ts`
- Modify: `backend/apps/api/src/web/web.controller.ts`
- Modify: `frontend/apps/web/src/lib/api.ts`
- Modify: `frontend/apps/web/src/app/api/auth/route.ts`
- Test: `backend/apps/api/src/scripts/test-security.ts`

**Interfaces:**
- `resolveGuardianLogin` is removed from direct login use.
- `verifyLoginCode` consumes a hashed OTP and returns a tenant-bound opaque session.
- `revokeSessionsForPrincipal(dbName, principal)` invalidates active sessions after a password/role change.

- [ ] Write failing tests for phone-only guardian login rejection, one-use OTPs, expired OTPs, and invalidation after a role change.
- [ ] Run the security test and record the expected failures.
- [ ] Hash OTP codes with a per-code random salt, use `crypto.randomInt`, validate with timing-safe comparison, and enqueue delivery through the existing Talk channel.
- [ ] Change guardian login to request/verify OTP only; retain staff password login with the same page API.
- [ ] Remove token values from all controller and Next route JSON responses; set secure cookie options in API and web façades.
- [ ] Revoke sessions on password reset and role update; derive RLS role from current staff data rather than an old claim.
- [ ] Re-run security test and existing onboarding/login gates.

### Task 3: Control-plane and edge trust boundary

**Files:**
- Modify: `backend/apps/api/src/config.ts`
- Modify: `backend/apps/api/src/provisioner/provisioner.controller.ts`
- Modify: `backend/apps/api/src/web/web.controller.ts`
- Modify: `deploy/Caddyfile`
- Modify: `deploy/docker-compose.yml`
- Test: `backend/apps/api/src/scripts/test-security.ts`

**Interfaces:**
- `CONTROL_PLANE_TOKEN` gates all `/v1` provisioning reads/writes using timing-safe comparison.
- `tenantFromReq` accepts `x-mandela-host` only from an internal-proxy source; direct client host/header spoofing fails.

- [ ] Write failing tests for unauthenticated control-plane denial and direct `x-mandela-host` tenant-header rejection.
- [ ] Run the security test and confirm both requests are currently accepted.
- [ ] Add `CONTROL_PLANE_TOKEN` to validated configuration and require it on every provisioner route.
- [ ] Configure Caddy to remove client-supplied tenant headers, set the trusted forwarded host, and stop public proxying of `/v1`.
- [ ] Make API tenant resolution fail closed when trusted forwarded host is absent in production.
- [ ] Re-run security tests and Caddy configuration assertions.

### Task 4: Production configuration and runtime controls

**Files:**
- Modify: `backend/apps/api/src/config.ts`
- Modify: `backend/apps/api/src/main.ts`
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/Caddyfile`
- Modify: `docs/DEPLOY-CHECKLIST.md`
- Test: `backend/apps/api/src/scripts/test-security.ts`

- [ ] Write failing tests that production config rejects known development secrets, missing payment token, and simulated WhatsApp delivery.
- [ ] Add strict production refinement to the Zod environment schema.
- [ ] Add JSON-body limits, proxy trust restricted to Docker private networks, security headers, health checks, resource limits, and API restart-safe shutdown.
- [ ] Update deployment checklist with encrypted off-site backups, restore drill, secret rotation, and production health verification.
- [ ] Run configuration tests in development and production-like environments.

### Task 5: Dependency and verification floor

**Files:**
- Modify: `frontend/apps/web/package.json`
- Modify: `frontend/apps/site/package.json`
- Modify: `backend/apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/DEV-PHASES.md`

- [ ] Upgrade Next.js and affected transitive runtime packages to audit-fixed compatible versions; use lockfile-respecting package-manager commands only.
- [ ] Run `pnpm audit --prod`; require zero critical/high findings or document an upstream-unfixable exception with compensating control.
- [ ] Run uncached typechecks, API security tests, RLS tests, web/site production builds, bundle budget, and existing regression gates.
- [ ] Add a release-hardening entry to `docs/DEV-PHASES.md` with the actual command evidence.

## Self-review

- Tenant binding, session revocation, privileged control-plane access, OTP, production configuration, edge header trust, dependencies, and deployment controls each have a task.
- Each task identifies its files, expected interfaces, failing test, implementation, and verification.
- No task depends on a placeholder or an undocumented interface.
