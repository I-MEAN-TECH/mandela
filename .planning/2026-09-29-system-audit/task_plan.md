# System audit

## Goal

Harden Mandela to a verified release floor: tenant-safe sessions, secure authentication, protected control-plane APIs, safe production configuration, and current dependencies.

## Phases

### Phase 5: Dashboard and module rationalisation
**Status:** complete

Audit every role dashboard and navigation route, research school-operations
dashboard patterns, remove duplicate modules, establish a concise module model,
then propose a staged implementation design for approval.

### Phase 7: Role navigation reliability audit
**Status:** complete

Verify visible navigation, destination routes, and runtime permission behavior
for Counter and every role. Resolve the source-of-truth conflict, then present
a minimal corrective design before implementation.

### Phase 1: Audit
**Status:** complete

Identify release blockers and preserve evidence.

### Phase 2: Tenant-safe sessions
**Status:** partial

Tenant-bound, 12-hour signed sessions and regression coverage are complete.
Server-side revocation/opaque sessions remain a later, deliberately scoped change.

### Phase 3: Authentication and control plane
**Status:** partial

Phone-only guardian login is removed; OTPs are hashed and guardian phone formats
are normalized. Privileged provisioner endpoints require a timing-safe token.
Production OTP delivery still needs a dedicated delivery workflow.

### Phase 4: Deployment and dependency floor
**Status:** complete

Fail closed in production, harden edge/runtime settings, upgrade dependencies, and verify.

## Next Step

Stack operational content cards across the app while preserving KPIs, charts,
graphs, tables, and form grids.

### Phase 14: Operational card columns
**Status:** complete

Remove multi-column layout only from outer groups of sibling content cards;
leave all KPI, data visualization, table, and form arrangements unchanged.

### Phase 13: Library desk column layout
**Status:** complete

Stack the Counter card above the Overdue card at every viewport without
changing any library workflow or data.

### Phase 12: Admissions list conversion
**Status:** complete

Use the fields already available on inquiries to filter one operational list;
preserve audited stage, enrolment, and lost actions per row.

### Phase 11: KPI card surface interaction
**Status:** complete

Update the shared `KpiCard` surface only, preserving the icon well, responsive
layout, and reduced-motion behavior.

### Phase 10: Shared KPI card hierarchy
**Status:** complete

Update the shared `KpiCard` primitive rather than patching individual pages so
all dashboard KPIs inherit the requested layout consistently.

### Phase 9: Payment learner workspace handoff
**Status:** complete

Keep the payment picker compact. Send View all to People/Learners, where every
authorized learner has direct View, Edit, and safe archive/restore controls.

### Phase 8: List-first data management
**Status:** complete

Make operational data sections list-first while retaining dashboard overview
cards, then add accessible filters and pagination for high-volume ledgers.

### Phase 6: Public website and product handoff
**Status:** in_progress

Audit the brand site, verify every public claim against the live product, remove
misleading entry flows, and design a richer conversion path that takes each
visitor to the correct live product surface.
