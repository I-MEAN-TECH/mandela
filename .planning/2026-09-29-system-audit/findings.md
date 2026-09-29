# Findings

Read-only audit evidence:

- The API exposes 275 controller routes in a single `WebController`; authorization is implemented as repeated inline checks rather than framework guards.
- `v1/schools`, `v1/schools/:id`, and `v1/schools` have no authentication. The controller itself says production mTLS/JWT is still to be added.
- Guardian login currently issues a durable session from a phone number alone. The separate OTP functions exist, but this endpoint does not invoke them.
- Session tokens are stateless HMAC payloads containing role, without an expiry or revocation state. Cookies use a 30-day lifetime and omit `secure`.
- Production config defaults security-critical secrets and callback validation to known/empty development values instead of refusing startup.
- The initial dependency finding is remediated: `pnpm audit --prod` now reports no known vulnerabilities. Both Next.js apps are at 15.5.24; API dependencies are at patched Nest 11.1.18 plus patched parser/upload overrides.
- The RLS script passed its five assertions, but only probes guardian, teacher, and bursar reads in the demo database. It does not exercise write policies, token/role changes, other nine roles, or cross-tenant routing.
- OTPs now use `crypto.randomInt`, keyed/salted storage, timing-safe verification, five-attempt lockout, and a short resend window. Guardian phone-only sessions are disabled, and phone formats normalize consistently.
- Production OTP dispatch is still not implemented: the current route only exposes the code in non-production. Production login therefore requires a real WhatsApp/SMS/email delivery workflow before it can be called release-ready.
- Sessions are tenant-bound, signed, `HttpOnly`, `Secure` in production, and expire in 12 hours. They are not server-side opaque/revocable; role/session invalidation remains a known limitation.
- Provisioner routes now require a timing-safe control-plane token. The public Caddy edge no longer proxies the direct API hostname.

Dashboard rationalisation research (external findings; treat as reference data):

- Role dashboards should be task-first: teacher (today's classes, attendance, marking, homework); guardian (child updates, fees, timetable, messages); leadership (attendance, finance, academic exceptions, approvals); specialist staff (their assigned workflow only).
- Research sources consistently group school operations into People/Admissions, Academics/Attendance/Assessment, Finance, Operations, Communications, and Configuration. Duplicating the same outcome across separate modules increases training cost and permission mistakes.
- Every role needs row- and field-level scope. In particular, transport, library, welfare, finance, and safeguarding must not inherit broad learner data access.
- Evidence gathered via Agent Reach/Exa on 2026-09-29. Second query was rate-limited after the first result set; use primary sources for later validation.
- No HTTP security headers, proxy trust configuration, API health checks, deployment resource limits, or backup encryption/off-site replication are defined in the inspected runtime configuration.

Public-site and product-handoff findings:

- `frontend/apps/site/src/lib/appLinks.ts` provides a single `NEXT_PUBLIC_APP_ORIGIN` boundary for all public-site-to-product links. The intended production split is root domain for the site and `app.<domain>` for the product.
- The `/start` page already presents three appropriate paths: school owner setup, staff join, and guardian login. This is the correct foundation to retain.
- The home-page `ParentCta` posts directly to the guardian OTP route and promises that a code was sent. Production OTP dispatch is still deliberately unimplemented, so this is currently a misleading production-facing flow and must be replaced or explicitly gated until delivery exists.
- Contact information uses placeholders (`+254700000000`, `schools@mandela.school`); these must not be presented as production support channels until real contact values are configured.
- The site has useful foundation pages (product, schools, parents, teachers, pricing, stories, about, contact, legal) plus metadata, robots, sitemap, and application JSON-LD. Its biggest gap is credible, verified proof and a clear demo/product-preview bridge rather than more generic pages.
