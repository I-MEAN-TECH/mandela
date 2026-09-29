# Admissions List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admissions stage-board with a clear, filterable list while retaining existing workflow actions.

**Architecture:** Keep `FunnelBoard` as the client owner of filtering, stage movement, and enrolment dialog state. Export a pure `filterInquiries` helper for contract coverage; render filtered rows as a responsive table using existing `@mandela/ui` components.

**Tech Stack:** React 19, Next.js 15, TypeScript, `@mandela/ui`.

## Global Constraints

- Use only existing `InquiryRow` fields and audited admission actions.
- No new dependencies, API endpoints, permissions, or theme changes.
- Keep keyboard-accessible native labelled filters and motion-safe shared UI.

### Task 1: Filter contract and list conversion

**Files:**
- Modify: `frontend/apps/web/src/app/app/people/admissions/AdmissionsClient.tsx`
- Create: `frontend/apps/web/src/app/app/people/admissions/AdmissionsClient.test.ts`

**Interfaces:** `filterInquiries(rows, filters)` matches text, stage, level, curriculum, source, and follow-up state; `FunnelBoard` renders those results in a list.

- [ ] Write the failing helper test with combined stage/text and metadata filters.
- [ ] Run `tsx src/app/app/people/admissions/AdmissionsClient.test.ts` and observe the missing export failure.
- [ ] Implement the pure filter and replace the stage columns with a labelled filter bar and table rows that retain next-stage/enrol/Lost actions.
- [ ] Run the focused test and `pnpm --filter @mandela/web typecheck`.
- [ ] Run the production build and browser smoke, then commit.
