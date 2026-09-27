# MANDELA Simplicity Standard — zero-training UX
### "The user must feel they already know what they are doing"

> Extends `docs/FORM-NAV-STANDARDS.md` (GOV.UK/NN/g evidence) from forms to
> whole product. Applies to every screen, every role, every surface. A feature
> that needs a manual is a bug.

---

## 1. The audience is real, and busy

- Teachers mid-lesson, bursars mid-queue, parents on a Ksh 10 data bundle.
- Many users have low digital literacy — tech vocabulary ("submit", "session",
  "sync") is noise. Nothing may assume reading beyond standard-4 English or
  Swahili.
- The test: **hand a phone to a first-timer; they finish the task without
  asking anyone.** If not, the screen is wrong.

## 2. The five hard rules

### Rule 1 — One gold button
Each screen has **exactly one** primary action (`Button variant="primary"`,
already a repo non-negotiable). Everything else is a pill, a link, or quiet.
The gold button says the outcome: **"Record payment"**, **"Save message"** —
never "Submit".

### Rule 2 — Buttons, not fields
Every choice is a **big tappable pill or card, not a dropdown**, when options
number ≤ 7. Pill groups (like the method picker in PayForm) make the state
visible — nothing hidden in a select. Dropdowns are for > 7 options only
(e.g. learner picker in a big school).

### Rule 3 — Step-based forms (the Wizard)
Anything with more than **3 inputs** becomes a numbered step flow:

```
  ① Who  →  ② How much  →  ③ Confirm  → done ✔
```

- One question per step, one visual focus.
- **Back is always available; nothing is lost.** Values persist per step.
- A **check-answers step** before the write: the user sees *exactly* what will
  happen, in plain words ("Aisha · Ksh 850 · M-Pesa") with a Change link per
  line — GOV.UK check-answers pattern.
- Success is a **full-screen state with a receipt number**, not a toast:
  the user should be able to show the screen to the person they served.
- Implementation: `<Wizard>` in `@mandela/ui` (this sprint). New flows MUST
  use it when > 3 inputs; retrofit existing long forms opportunistically.

### Rule 4 — Plain language, numbered steps, no jargon
- Verbs over nouns: "Mark everyone present", not "Bulk attendance update".
- Numbers are spelled into the flow: "Step 2 of 3", "3 learners absent".
- Money reads like money: "Ksh 4,500" (the `Money` component), never raw
  cents or floats in copy.
- Error text says the fix: "The phone should start 07…, 01… or 254…" — never
  an error code.
- Kenyan register: M-Pesa, Ksh, learner names — the words people already use.

### Rule 5 — Silence is failure: always show "what now?"
Every completed action answers the next question on the same screen:
record a payment → show the receipt + "Record another" + "Send parent the
receipt" (when Talk is wired). The user never wonders "did it work?" or
"what now?".

## 3. The zero-training checklist (PR review gate)

- [ ] One gold button on the screen?
- [ ] Choices are pills/cards, not dropdowns (≤ 7 options)?
- [ ] > 3 inputs? → Wizard steps + check-answers + Change links
- [ ] No jargon; error messages state the fix
- [ ] Success state shows the artifact (receipt/number) and the next action
- [ ] Works one-handed, on a small Android, on 3G, offline-tolerant
- [ ] Skeletons, never spinners (repo rule) — motion reassures, it doesn't gate

## 4. Where this shows up first

- **Record Payment** is the reference flow (retrofitted to `<Wizard>`:
  Who → How much → Method+Reference → Check → Receipt).
- **Settings → Daily loop** (WhatsApp/Email connect) is a Wizard — an admin
  with no IT background connects the school in 4 steps with a Test button.
- Every new form follows `Form.tsx` + this doc; deviations need a documented
  reason in `docs/FORM-NAV-STANDARDS.md`.
