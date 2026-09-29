# Admissions list design

Replace the horizontal, stage-partitioned admissions board with one responsive table. The table has one row per family and preserves the existing next-stage, enrol, and Lost actions.

Filters use only data already supplied by `InquiryRow`: text (child, parent, phone), stage, level interest, curriculum, source, and follow-up presence. The list is newest first and renders a clear no-results message. No new API, role, or theme changes are required.

The work remains inside the existing `FunnelBoard` client boundary. Pure filtering is exported for deterministic tests; all mutations continue through the existing audited actions.
