# Offline & Low-Connectivity Resilience (flank #5) — the constraints

> Written **before** the build, as the flank's own lean position requires:
> "Honest tech decision needed — document constraints first."
> Schema: migration 032 (`sync_outbox`). Endpoints: `/web/admin/offline/*`.

## The decision

**Reads cache, writes queue — with the server as the only arbiter.**
The client keeps an explicit sync state (online / queued / applied /
rejected); nothing is silently lost or silently retried forever.

## What may queue offline

| Op | Endpoint semantics | Why |
|---|---|---|
| `attendance.mark` | same upsert as online mark, keyed by `uq_att_learner_day` | two taps in class is the #1 offline moment; conflicts resolve "first flush wins" via `DO NOTHING` on the server |

New write kinds must be **added to `OUTBOX_ALLOWED` in `queries.ts` with a
reason here** — the allowlist is the constraint, not a config file.

## What NEVER queues (the manual-first money law, §2 ⑧)

`payment.record`, `payment.confirm`, `pocket.txn`, `invoice.item` — the
flusher hard-rejects these and records the rejection with note
`money never queues — key it online`. A double-keyed receipt on a flaky
connection is worse than a delayed receipt. The bursar keys money when
connected, full stop.

## Sync state (what the UI shows)

- **Online** — everything normal.
- **Queued (n)** — n ops held in the client queue (localStorage), flushed
  automatically when connectivity returns; the banner is visible, not a
  toast.
- **Applied** — server confirmed; op leaves the queue. Server dedupes by
  `client_id` (UNIQUE), so a retry after a dropped response is safe.
- **Rejected** — server refused (money op, unknown op, empty payload). The
  op is kept visible with the rejection note; it never disappears silently.

## Conflict policy

The server runs the endpoint semantics, never the client's claim. For the
one allowlisted op, the DB's unique arbiter makes re-marks idempotent —
first flush wins, later flushes no-op. No merge, no vector clocks; honest
and boring.

## Client implementation (PWA)

- Reads: Next.js pages + a service-worker runtime cache for GETs
  (`stale-while-revalidate`), so the teacher's class list survives a dead
  zone.
- Writes: a `queueOp()` helper stores `{client_id (crypto.randomUUID),
  op, payload}` in localStorage and flushes on `online` + app focus.
- The banner component is `SyncBanner` in the app shell — explicit state,
  never silent.

## Deliberately out of scope

Background sync API (unreliable on iOS), full CRDT sync, offline money,
offline reports. Revisit only with a real school's evidence.
