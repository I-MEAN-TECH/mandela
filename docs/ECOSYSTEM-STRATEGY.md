# MANDELA — Ecosystem Strategy
### How a school platform becomes the "Microsoft Office of Kenyan schools"

> Companion to `docs/MODULES.md` (what is built) and `docs/RECORD-FORMAT.md`
> (the portable record). This document is the **why** behind the module order.

---

## 0. The one-sentence thesis

Office didn't win because Word was the best editor; it won because **the files
had gravity, the apps fed each other, and institutions bought it once for
everyone.** MANDELA copies all three loops for schools: per-school data as the
gravity well, five modules as the flywheel, and the school (not the teacher)
as the unit of adoption.

---

## 1. The three loops, mapped

### Loop 1 — Data gravity ("the file format")

| Office | MANDELA |
|---|---|
| `.docx` / `.xlsx` — the artifacts every tool must read | **The per-school Postgres schema + signed portable records** (`docs/RECORD-FORMAT.md`) |
| Files accumulate in a folder for years | **Fee ledgers, attendance history, CBC assessments accumulate per school DB for years** |
| Losing the files = losing the org's memory | A school that leaves loses receipts, statements, report cards — nobody walks away from 10 years of ledger |
| Office reads/writes rivals' formats to stay central | MANDELA **exports** the signed record to parents and the ministry, so it stays the **source of truth** even for people who never open the app |

**Rule that falls out of this:** every artifact a parent or ministry values
(statement, report card, receipt) must be **exportable, verifiable, and
portable** — issued *by* MANDELA but owned *by the parent*. Data that can't
leave is a liability (vendor lock-in resentment); data that can leave but
always comes back to be issued is gravity.

**Status today:** per-school DB + RLS + audit log exist. The signed export
(Record v1) is the missing artifact — see `docs/RECORD-FORMAT.md`.

### Loop 2 — Suite flywheel ("each app feeds the next")

| Office chain | MANDELA chain |
|---|---|
| Outlook (daily habit) → creates docs → stores in SharePoint → analyzed in Excel | **Talk (daily habit)** → Money events → Classroom evidence → **Insights** |

The flywheel turns, concretely, like this:

1. **Teacher marks attendance** (2 taps) → absence triggers a guardian
   notification (Talk) → guardian opens Pay tab (Money).
2. **Bursar records payment** → receipt → statement (Record) → parent trust.
3. **Every module writes events** → Insights computes collection rate,
   attendance trend, WhatsApp coverage — the principal's morning screen.
4. **Insights makes the next module decision** ("Class 6B collection is 40%")
   → bursar bulk-bills (Money) → flywheel spins again.

**Why parents are the engine, not the passenger:** Office sold to the
enterprise but lived in the employee's day. MANDELA's "employee's day" is the
**parent's WhatsApp**. The admin web app is the factory; the parent daily loop
is the habit surface. A platform the parent touches daily cannot be quietly
replaced by one they don't.

**Status today:** the five modules are live end-to-end; the delivery worker
exists but was platform-config. **Daily loop v1 (this sprint):** per-school
WhatsApp/Email configured by the admin in Settings → step-form, with a
**daily digest** (fees · homework · attendance) queued per guardian and
delivered through the worker.

### Loop 3 — Institutional distribution ("one buyer, many desks")

| Office | MANDELA |
|---|---|
| Enterprise license → installed on every desk | **School provisioning → every role gets a dashboard, parents get WhatsApp** |
| IT dept decides; users follow | Principal decides; teachers/guardians follow |
| Format compatibility kept rivals out of renewals | **Curriculum-as-configuration (CBC/8-4-4/British packs)** keeps rivals out of renewals — switching means re-entering every learner's assessment history |
| Volume licensing = pricing power | Per-school SaaS + ministry/KEMIS-shaped reporting = pricing power |

The provisioner (`backend/docs/PROVISIONER.md`) is the sales motion: one
command stands up a school. A county office or a sponsors' network can onboard
50 schools the way IT rolled out Office — that is the distribution moat, and
it is why **no feature may require per-user training** (`docs/SIMPLICITY.md`).

---

## 2. What "used in offices every day" requires

1. **A daily open.** The digest (WhatsApp/email) is MANDELA's cold open. If
   the parent opens the app zero times, the digest still lands daily. Habit
   without installation.
2. **A paper trail people trust.** Signed records (Record v1) make MANDELA
   the notary of school life. Trust compounds; feature lists don't.
3. **An audit spine.** Every shilling and every consent is append-only
   auditable — the "no consequences" failure the video calls out is a
   *systems design* failure, and the integrity checks in the module harness
   are the code version of consequences.
4. **Zero-training UX.** The 60% don't read manuals. `docs/SIMPLICITY.md`
   makes one-gold-button, step-form, plain-language screens a hard rule.
5. **Access to capital, in miniature.** Fee plans, bursaries, and clean
   statements give small schools the credit-visibility that titling gives
   land: provable history → trust → financing.

---

## 3. The Wanjigi test (from the video that triggered this doc)

- **"What has not been issued is so much more"** → don't fight for the 20%
  (schools already using software); the 80% is schools where the *parent
  relationship* is untitled. The daily loop + portable records is the title.
- **"Infrastructure follows demand"** → build where economic activity already
  happens: fees first, transport next (routes = physical demand lines).
- **"Government should follow the market"** → the platform should follow the
  parent's habits (WhatsApp), not force guardians to adopt an admin app.
- **"Consequences sustain systems"** → integrity invariants + audit ledger +
  signed records = a system that cannot quietly rot.

---

## 4. Sequencing (12-month horizon)

| Phase | Bet | Why now |
|---|---|---|
| **Now** | Daily loop v1 (per-school WhatsApp/Email + digest) + Record v1 signed statements + integrity checks | Turns the ledger into a habit and a trust artifact — the two things rivals can't copy from a demo |
| +1 term | CBC assessment capture + report cards | The module parents feel most; schema already waits |
| +2 terms | M-Pesa Daraja auto-pay + fee plans | Money becomes automatic; statements become cashflow history (credit-visibility) |
| +3 terms | Transport desks + driver app | Last parked role; routes are the final demand line |
| +4 terms | Ministry/KEMIS-shaped exports, county onboarding | Institutional distribution: many schools, one buyer |

---

*The strategy in one line: **own the records, feed the parents daily, make
the school the buyer, and never need a manual.***
