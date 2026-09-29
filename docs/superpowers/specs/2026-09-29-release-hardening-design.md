# Release hardening design

## Goal

Make the current web platform safe to deploy by closing the confirmed tenant, authentication, control-plane, dependency, and runtime-control gaps.

## Chosen approach

Use a signed, server-side session record rather than trusting a bearer-style principal alone. Every session carries its school database identity, a random session identifier, an expiry, and a version checked against the current staff role. The API derives tenant identity from a proxy-only header, rejects tenant-selection headers from direct clients, and every authenticated operation verifies its session belongs to that tenant.

## Boundaries

- The web application remains the browser-facing API façade. Direct API access is restricted to trusted reverse-proxy traffic and controlled webhook routes.
- Provisioning stays available for operations but requires an explicit control-plane secret and is never routed publicly by default.
- Staff use password login; guardians use an actual one-time code. Phone-only login is removed.
- Session cookies are secure, HTTP-only, same-site, short lived, and revocable. Tokens are never returned to browser JavaScript.
- Production configuration has no permissive default for secrets, payment validation, or simulated message delivery.
- Database RLS remains a backstop. Tests add cross-tenant and stale-role/session cases.

## Data flow

1. Reverse proxy strips external tenant headers and writes the resolved host into `x-mandela-host` only for web-to-API traffic.
2. Login resolves a tenant, verifies credential/OTP, creates a server-side session with tenant slug, user identity, role snapshot, expiry, and revocation state.
3. Browser receives only a secure opaque cookie. API loads the server-side session, verifies active status and tenant match, then resolves current staff state before opening its RLS transaction.
4. Role changes/password resets revoke affected sessions. A session can never cross tenant boundaries.
5. Control-plane endpoints require a timing-safe shared secret and are not reverse-proxied publicly.

## Verification

- Regression tests prove a token/session for tenant A is rejected for tenant B, revoked sessions fail, role changes invalidate elevated sessions, guardian phone-only login fails, and OTP codes are one-use and expire.
- RLS tests include sensitive read/write paths and all supported staff roles.
- Dependency audit has no critical/high production vulnerabilities.
- Fresh typecheck, production build, bundle budget, API security tests, and existing gates pass.

## Non-goals

This phase does not change school workflows, introduce a new identity provider, or claim that a source-only audit replaces a real production penetration test, restore drill, or device validation.
