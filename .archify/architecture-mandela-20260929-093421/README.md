# Mandela architecture — Archify artifact

**Open `mandela-architecture.html`** — a self-contained interactive architecture diagram of the Mandela school platform (no server, no dependencies; share or email the file as-is).

**Open `mandela-architecture-deck.html`** — a 7-slide presentation of the system and the work shipped so far, with deep links into the interactive diagram.

## How it was produced

Authored from `docs/SYSTEM-OVERVIEW.md` as a typed Archify IR (`candidate.json`, schema v1, architecture mode), then finalized with the [archify skill](https://github.com/tt-a1i/archify) v3.0.1:

```bash
node archify/bin/archify.mjs finalize architecture candidate.json mandela-architecture.html --quality showcase --json
```

Gates passed: schema/layout validation, deterministic delivery, strict provenance check, real-browser check. Visual-check captures (`*.png`, local evidence, not committed) also passed: no overflow, text readability ≥ 7.5px.

## Iterating

Edit `candidate.json`, then re-run the finalize command above. The diagram supports: `F` presentation stage, `S` visual styles, `T` theme, `PATH` route probes (try `daraja → school-db`), node focus with upstream/downstream reach, and `E` export (PNG/SVG/WebM). Deep links look like `#focus=<node-id>&reach=upstream`.

Last updated: September 2026 (after migrations 049–052, the permissions matrix, and the support-staff dashboards wave).
