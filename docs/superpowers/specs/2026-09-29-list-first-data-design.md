# List-first data management design

## Goal

Make every operational data surface readable as a compact list by default,
without flattening dashboard KPI and chart overviews, and make the highest
volume school records practical at 500–1,000+ rows.

## Behaviour

- `/app` remains Cards by default because it is a decision dashboard.
- Every non-dashboard app section starts in List mode. The existing Cards/List
  control remains available and remembers an explicit user choice per section.
- Data tables remain semantic HTML tables with horizontal scrolling on narrow
  screens; list mode never hides columns or actions.
- Learner and payment ledgers get local, instant filtering and a 25-row page
  limit. Search works across identifiers and names; filters are scoped to
  fields users actually manage.

## Data controls

| Surface | Search | Filters | Page size |
| --- | --- | --- | --- |
| Learners | name, admission number, class | class, status, gender | 25 |
| Payments ledger | receipt, learner, class | class, state, method, date range | 25 |
| Existing report builder/exams/audit | retain their existing dataset-specific filters | no duplicate control layer | existing |

## Constraints

- Use `@mandela/ui` tokens/components; no new dependency or theme change.
- Filtering changes only what is displayed. API/RLS authorization remains the
  authority and no client filter can reveal a row that was not returned.
- Native labeled inputs/selects, visible result count, keyboard operation,
  useful no-results copy, and horizontal table overflow are required.
- Server-side query filtering is the follow-up when an API returns more than a
  manageable page; this batch keeps current authorized payload contracts and
  adds client-side pagination to prevent an uncontrolled DOM.
- Boarding is deliberately not shown as a list filter yet: the current learner
  list API does not return that field, and the UI must not offer a filter it
  cannot apply truthfully.

## Verification

- Unit contracts prove default mode, filter matching, and pagination.
- Web typecheck and production build pass.
- Browser smoke proves a non-dashboard section starts in List and the learner
  and payment controls are labelled and usable.
