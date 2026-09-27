# Fee Reality Check — private-school collection pain vs our Money model

> Research note (2026-09-10) in the Admin-dashboard series. Question: does the
> Money/levies model (as built in `001_schema.sql` + `queries.ts`) survive the
> fee-collection realities private schools actually face? Market sources are
> named; schema readings are verified against code, not guessed.

---

## 1. What the market says (sourced)

**Part payments & chasing balances.** FSD Kenya's field study documents the
cycle: parents pay what they can when they have it; schools send learners
home over incomplete payments; chasing balances consumes the bursar's week.
EduPath's guide for Kenyan schools is blunt: the legal remedy for unpaid fees
is limited (withholding report cards/certificates is the contested
boundary), so the real lever is a clear payment record and early reminders.

**Sibling discounts are standard practice.** Published Kenyan fee policies:
Mikisa Schools 2.5% / 5% / 7.5% for 2nd/3rd/other siblings; Woodlands Star
5% per additional child + 5% annual-prepayment discount; Nova Pioneer up to
30% for the 5th child. This is not an edge case — mid-market private
schools advertise it.

**Mid-term admissions are routine.** Low-cost private schools charge
KES 20–50k/term, mid-range 50–200k (Huduma Global); learners join whenever
families move. Some schools pro-rate (ISKA-style policies differ), many
just bill "full term, come when you like." Note: ISK explicitly does NOT
prorate — the market is genuinely split.

**The envelope.** Almost every Kenyan private school publishes a fee
*structure* per class per term with named items (tuition, lunch, transport,
activity) plus entry extras (admission fee, uniform). Our `fee_structure` →
`fee_item` model mirrors this almost 1:1.

---

## 2. What the schema already handles (verified in code)

| Reality | Model | Verdict |
|---|---|---|
| Per-class, per-term fee structures with named items | `fee_structure(term_id, class_id, name, amount)` — `class_id` NULL = all classes | ✅ exact fit |
| One-off billed items (admission fee, trip, uniform) | `fee_item.source = 'manual'` | ✅ supported |
| Optional levies behind documented consent (lunch, transport) | `is_optional` + `consent` ledger (subject_type `fee_levy`, channel, evidence) | ✅ ahead of the market — most competitors don't model consent at all |
| Balance counts optional items only when granted | `v_fee_balance` (`is_optional = false OR consent = 'granted'`) | ✅ correct semantics |
| Part payments | `payments` rows are free amounts against a learner; balance = due − confirmed | ✅ works |
| M-Pesa with idempotency | `mpesa_txn` (unique receipt no, raw callback, pending state) | ✅ designed right |
| Audit: who recorded/confirmed what | `audit_log` on both record and confirm paths | ✅ the owner's fraud answer |

**BUT — one real gap found while reading:** payment rows are not
*allocated* to anything. `recordPayment` inserts an amount against a
learner; nothing decrements specific fee items. Balance math (due minus
paid) is done by summation. That works for a single-term view but has two
consequences: (a) a payment spanning two terms (e.g. arrears + current) can
be represented but not *explained*; (b) fee-defaulter and
statement-per-learner screens have no per-item allocation to lean on.
Allocation is the classic fee-ledger problem and every mature system solves
it with a `payment_allocation(payment_id, fee_item_id, amount_cents)` join.

---

## 3. The gaps, ranked by owner pain

1. **Sibling discounts — the clearest gap.** The schema has no discount
   concept at all: `fee_item.amount >= 0` with no negative line, no link
   between learners of one family. Market publishes discount ladders
   (2.5%→7.5%, 5%/child, up to 30%). Owner pain is real every single term.
   *Fix shape:* `source = 'discount'` negative-amount fee items (keeps
   integer-cents rule, zero new tables) + a "who else is in this family?"
   lookup via `learner_guardian` (shared guardian ⇒ siblings). Automatic
   sibling *application* is policy — schools differ — so v1 = assisted
   (Admin taps "apply sibling discount", system proposes the ladder).
2. **Mid-term pro-rating — a policy toggle, not a feature.** Bill full
   term vs pro-rate by days. `fee_item` already allows any amount, so a
   pro-rated bill is creatable today — manually. *Fix shape:* a school
   setting `prorate_midterm` + an "admit learner" flow that computes the
   amounts once at billing time (never at read time — keep balances
   reproducible).
3. **Arrears across terms.** Balance view is all-time (due − paid), so
   arrears exist mathematically. What's missing is *presentation*: a
   statement that separates "Term 1 balance" from "Term 2 charges" — and
   allocation (gap above) is what makes that statement defensible.
4. **Exam-entry blocking is a policy temptation, not a data need.** The
   market's disputed practice (withholding reports/certificates). We should
   NOT build "block" features; we should build the *conversation* surface:
   guardian sees balance in-app, reminders are WhatsApp-first. Owner-side
   "learners with balance > X" list already falls out of the model.

---

## 4. Verdict and build-order impact

The Money model survives contact with the market — structures, consent,
part payments, audit are all right, and consent-gating is genuinely ahead
of competitors. Three additions, in order:

1. **`payment_allocation` table** (migration 008, alongside the staff
   columns) — allocations recorded from day one even if UI shows totals;
   makes statements/arrears/defaulters defensible later. Backfill = none
   needed if we start before real volume.
2. **Sibling discount as negative fee items** + Admin "apply discount"
   action on the People/Money seam (v1 assisted, ladder per school policy).
3. **Pro-rate toggle** at admission time (Settings-level policy, computed
   once on enrolment).

Not building: exam/certificate blocking, automatic discount rules, term
payment plans (ISASA-style) — all parkable without model damage.

---

## 5. Sources

- FSD Kenya — "The unusual dynamics of school fee payment (or non-payment)
  in a Kenyan school" (fsdkenya.org blog)
- EduPath Kenya — "Dealing with late fee payments — a practical guide for
  Kenyan schools" (edupath.co.ke, Jun 2026)
- Mikisa Schools — Fee Schedule & Policy 2025/2026 (sibling ladder)
- Woodlands Star Kenya — Fee Schedules & Finance Policy 2025-26 (5%/
  additional child, annual prepay discount)
- Nova Pioneer — Enhanced Sibling Discount Policy 2026 (up to 30%)
- ISK — Tuition & Fees (explicit no-proration counterexample)
- Huduma Global — fee bands: low-cost 20–50k, mid-range 50–200k per term
- Ministry of Education / KTN reporting on illegal fees & withheld
  certificates (2025–2026)
