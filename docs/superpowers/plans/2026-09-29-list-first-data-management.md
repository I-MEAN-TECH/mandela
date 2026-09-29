# List-first data management implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default operational modules to compact list view and make the two highest-volume ledgers filterable and bounded.

**Architecture:** Extend the existing `ViewMode` boundary with a scope-aware default: dashboard cards remain intact and every operational section defaults to list unless the user explicitly chooses cards. Keep filter state inside the existing client ledgers, where it cannot bypass RLS, and expose pure helpers for deterministic matching and pagination tests.

**Tech Stack:** React 19, Next.js 15, TypeScript, `@mandela/ui`.

## Global Constraints

- Keep dashboard `/app` cards and charts unchanged by default.
- Use native accessible form elements with labels and result counts.
- Retain Cards/List override persistence per section.
- No new dependencies, theme changes, or authorization changes.

### Task 1: Scope-aware list default

**Files:**
- Modify: `frontend/packages/ui/src/components/ViewMode.tsx`
- Create: `frontend/packages/ui/src/components/ViewMode.test.ts`

**Interfaces:** `defaultViewForScope(scope: string): ViewMode` returns `cards` for `/app` and `list` for every operational app scope; `readStoredView()` uses that default when no valid stored choice exists.

- [x] Write a failing test for `/app` and `/app/people` defaults.
- [x] Implement the helper and route bootstrap/toggle reads through it.
- [x] Run focused test and web typecheck.

### Task 2: Learner ledger filtering and pagination

**Files:**
- Modify: `frontend/apps/web/src/app/app/people/learners/LearnerActions.tsx`
- Create: `frontend/apps/web/src/app/app/people/learners/LearnerActions.test.ts`

**Interfaces:** `filterLearners(rows, filters)` returns matching authorized rows; UI offers search, class, status, gender, count, and 25-row pages. Boarding is deliberately excluded because the learner-list API does not expose it.

- [x] Write failing pure helper coverage for filter matching and page slicing.
- [x] Implement controls, count, page cap, no-results copy, and actions.
- [x] Run focused test and web typecheck.

### Task 3: Payment ledger filtering and pagination

**Files:**
- Modify: `frontend/apps/web/src/app/app/money/PaymentsLedger.tsx`
- Create: `frontend/apps/web/src/app/app/money/PaymentsLedger.test.ts`

**Interfaces:** `filterPayments(payments, filters)` matches receipt/learner/class plus state/method/date constraints; the rendered ledger has a 25-row page cap and accessible controls.

- [x] Write failing pure helper coverage for all filters.
- [x] Implement controls, count, pagination, and no-results state.
- [x] Run focused tests, typecheck, production build, and browser smoke.
