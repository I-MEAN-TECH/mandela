# UX Fix Plan — All 9 Blockers

## Status Legend: [ ] not started | [~] in progress | [x] done

## Group A — Quick wins (no new backend)
- [ ] A1: Fix phantom role names (`"secretary"`, `"deputy"`) in 3 page guards
- [ ] A2: Wire PDF download links from Teacher class page and Bursar collect page
- [ ] A3: Expand BellMenu rows for all roles (pending approvals, incidents, etc.)

## Group B — Backend endpoints needed
- [ ] B1: `GET /web/search?q=` — school-wide search (learners, staff, guardians, receipts)
- [ ] B2: `GET /web/bell` — live counts per role (pending_payments, approvals, announcements)

## Group C — Non-admin dedicated role screens
- [ ] C1: Dorm Parent rollcall screen `/app/rollcall` (list boarders, mark present/absent)
- [ ] C2: Driver manifest screen `/app/manifest` (route stops, tick off pickups)
- [ ] C3: Librarian issue/return action from `/app/operations/library` (not just Today pulse)
- [ ] C4: Patron award house points from `/app/operations/houses` (not just Today pulse)

## Group D — Post-save success states
- [ ] D1: Add SuccessBanner/receipt state to Laundry form
- [ ] D2: Add success feedback to HR leave apply
- [ ] D3: Add success feedback to Collect payment form

## Group E — Homework & assessment
- [ ] E1: Homework submissions list on `/app/homework` for teachers
- [ ] E2: CBC assessment capture screen `/app/academics/assessment`

## Group F — M-Pesa (requires Daraja credentials)
- [ ] F1: STK Push button on `/app/pay` (guarded behind env flag)
