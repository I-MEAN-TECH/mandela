# Operational Card Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operational cards full-width breathing room by stacking sibling cards vertically, without changing KPI, chart, graph, table, or form layouts.

**Architecture:** Change only outer card-group grid containers that directly place sibling `Card` components. Retain internal control grids and all KPI/chart containers exactly as implemented.

**Tech Stack:** React 19, Next.js 15, TypeScript, Tailwind, `@mandela/ui`.

## Global Constraints

- Never alter grids containing `KpiCard`, charts, graphs, tables, or form fields.
- Preserve card order and every existing interaction.
- No new dependencies, API, permissions, or theme changes.

### Task 1: Stack operational card groups

**Files:**
- Modify operational client/page components containing outer sibling `Card` grids.
- Test: web typecheck, bundle budget, theme policy, whitespace diff.

**Interfaces:** Existing component props and card contents remain unchanged; only outer layout classes lose multi-column variants.

- [x] Identify direct `Card` sibling containers and exclude KPI/chart/form/table grids.
- [x] Replace their multi-column outer grid classes with a single-column `grid gap-*` container.
- [x] Run TypeScript, budget, theme, and whitespace gates.
- [x] Run production build and local smoke, then commit.
