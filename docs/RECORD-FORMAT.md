# MANDELA Portable Record Format — Record v1
### The "land title deed": school records parents own and can verify anywhere

> Part of the ecosystem bet (`docs/ECOSYSTEM-STRATEGY.md` §Loop 1): artifacts
> that leave the platform but always come back to be issued are data gravity.
> This document specifies the format; the API endpoint and offline verifier
> are implemented per §5.

---

## 1. Principles

1. **Parent-owned.** A record is issued *to a guardian* — they keep the file,
   forward it, print it. The school DB is the source of truth; the file is
   the title deed that proves it.
2. **Verifiable offline.** Anyone — another school, a bank, a bursary panel,
   the ministry — can verify authenticity with one command and **no network**.
   HMAC-SHA256 over a canonical serialization, keyed by the school's secret.
3. **Tamper-evident chain.** Each record commits to the previous one's hash
   (`prev_hash`), forming a per-school append-only chain. Re-ordering,
   deleting, or editing history breaks the chain.
4. **Human-readable first.** The file is JSON with a plain-language
   `human` block. A parent reads it without tooling; the crypto lives beside
   the words, not instead of them.
5. **No PII beyond necessity.** Learner identified by admission number +
   first name; guardian by phone hash. Kenya DPA minimal-data rule.

---

## 2. Envelope

```json
{
  "format": "mandela.record.v1",
  "school": { "name": "St Mary's Junior School", "slug": "stmarys" },
  "learner": { "admission_no": "SMJ-0042", "first_name": "Aisha", "class": "Grade 5 — Blue" },
  "guardian_phone_hash": "sha256:9f2a…",   // proves who it was issued to, w/o exposing the number
  "kind": "fee_statement | report_card | attendance_summary",
  "term": { "year": 2026, "name": "Term 3" },
  "issued_at": "2026-09-24T09:00:00Z",
  "human": { "balance": "Ksh 4,500.00", "note": "All figures in Kenyan shillings." },
  "body": { "…kind-specific…" },
  "prev_hash": "sha256:…",                  // chain to previous issued record for this learner
  "signature": { "alg": "HMAC-SHA256", "v": "hex…" }   // over canonical(record minus signature)
}
```

**Canonicalization:** `JSON.stringify` with keys sorted lexicographically,
recursively; no whitespace; numbers as integers (cents) — matches the
"money is integer cents" non-negotiable.

## 3. Bodies (v1)

- **fee_statement** — per fee item: `title, amount_cents, optional, consented`;
  payments list `receipt_no, amount_cents, method, paid_at, state`;
  totals `billed_cents, paid_cents, balance_cents` (balance = v_fee_balance
  semantics: optional items count only when consent granted).
- **report_card** — per learning area: `area, strand, score, scale` straight
  from `assessment`; attendance counts `present, late, absent, excused`.
- **attendance_summary** — per-day marks for the term, plus counts.

## 4. Verification

- **In-app:** the record re-verifies on every view (endpoint recomputes HMAC).
- **Offline / third-party:** `node scripts/verify-record.mjs statement.mandela.json --key <school-key>`
  → prints `VALID` / `INVALID (reason)`. No DB, no network, no MANDELA install
  beyond Node.
- **Key custody:** `school.channel_config.record_secret` (migration 033),
  generated at first export, readable only via the API; used for HMAC only.
  Rotating the key invalidates nothing already verified offline — verifiers
  keep the historical key alongside the record.

## 5. Implementation map

| Piece | Where |
|---|---|
| Endpoint `GET /web/records/:learnerId/:kind?termId=` | `web.controller.ts` → `records.ts` (staff or that learner's guardian only — RLS holds) |
| Canonical + sign helpers | `backend/apps/api/src/records/canonical.ts` |
| Offline verifier | `scripts/verify-record.mjs` (repo root scripts/) |
| Chain storage | each export appends a row to `record_export(learner_id, kind, payload_hash, prev_hash, issued_at, issued_to)` — the export *is* audit-logged |

## 6. Deliberately out of scope for v1

- Public key signatures (Ed25519) — HMAC is enough while records verify
  against the school's key; asymmetric keys arrive when third parties need to
  verify *without* per-school key exchange.
- PDF rendering — the JSON is the source of truth; print layout reads it.
- Cross-school transfer format — needs ministry alignment (KEMIS-shaped
  export comes later, same envelope, different `kind`).
