# Form & Navigation Standards — how Mandela does forms

> Evidence-based rules (2026-09-10 research sweep via agent-reach: Exa search
> + Jina Reader). Every rule carries its source. **We build what the evidence
> and the market say, not what tastes good.** These rules bind every form in
> the product — staff, admin, and guardian surfaces alike.

## Why this matters (the numbers)

- Forms compliant with usability guidelines: **78% of users submit correctly
  on the first try vs 42%** for non-compliant forms; completion time drops
  significantly (Seckler et al., CHI 2014, N=65 eye-tracking; NN/g summary).
- Inline validation (done right) makes users **faster, more successful, less
  error-prone, more satisfied** (Wroblewski/Etre study, 22 participants,
  6 form variants).
- The top user-reported form problems in the CHI'14 interviews were
  **missing format specs, unclear required/optional marking, and too many
  fields** — in that order.
- Multicolumn forms cause **misread and skipped fields**; 16% of e-commerce
  sites still commit this mistake (Baymard, repeated usability rounds).
- GOV.UK runs the world's most-tested form patterns on real citizens and
  publishes them free. We borrow their patterns wholesale.

## The 12 rules (each with its source)

1. **Ask only what we need.** Every field must earn its place — cut anything
   derivable, deferrable, or droppable. Fewest fields that works.
   *Source: NN/g rec #1; CHI'14 interviews ("too many fields").*
2. **One column. Always.** Related micro-groups (day/month/year, OTP digits)
   may share a row; the form itself never splits into columns.
   *Source: NN/g rec #3; Baymard multicolumn studies.*
3. **Label above the field, always visible.** No placeholder-as-label —
   placeholders vanish on input, fail validation, and break scanning.
   No icon-only fields. *Source: NN/g recs #2/#5; Google CHI'14 eye-tracking.*
4. **Mark required by omission.** Make everything required unless proven
   otherwise; the rare optional field is labeled "(optional)".
   *Source: NN/g rec #7; CHI'14 top interview issue.*
5. **State formats before submission.** Phone +2547XXXXXXXX, admission no,
   KES amounts — show the format as hint text under the label, never as a
   surprise error. *Source: CHI'14 guideline 13, the single highest-impact
   rule in the study.*
6. **Match field size to input size.** Money fields the width of real
   amounts, dates as date inputs with clear format.
   *Source: NN/g rec #6.*
7. **Validate on submit, inline on blur — never mid-typing.** On submit:
   error summary block at top + per-field messages. On blur: field-level
   check (after 500ms) for format-y fields (phone, amounts, dates).
   Nothing validates before a field is complete. Also: `noValidate` on
   forms so the browser's inconsistent HTML5 bubbles never appear — we
   render our own accessible messages. (The two traditions converge here:
   Wroblewski's "after" method is our on-blur; GOV.UK's "validate on
   continue" is our on-submit.)
   *Sources: Wroblewski/A List Apart; GOV.UK validation pattern.*
8. **Error summary + per-field errors, both always.** Summary at top:
   "There is a problem" + linked list that jumps to each field. Per-field:
   red border AND red text (never color alone), message says **how to fix
   it**, and every input keeps what the user typed.
   *Sources: GOV.UK error-summary component; NN/g rec #10.*
9. **Never clear a completed form after a failed submit.** React state
   preserves entries; server re-render repopulates values.
   *Source: Google CHI'14 (guideline 15 — among the most-mentioned fixes).*
10. **No Reset/Clear buttons. Anywhere. Ever.** Accidental data loss costs
    more than the rare restart. *Source: NN/g rec #9; CHI'14 guideline 20.*
11. **Radios for ≤5 known options; selects only for longer stable lists.**
    A tap beats a tap-and-scroll. *Source: NN/g rec #8; CHI'14 guideline 9.*
12. **Long forms: steps with a Check answers page.** Group related
    questions (one topic per step, GOV.UK "one thing per page"), simple
    "Step 2 of 3" indicator, and a review page with Change links before
    anything submits. *Sources: GOV.UK question-pages + check-answers
    patterns; GOV.UK blog "one thing per page".*

## Where each form in the product stands (audit 2026-09-10)

| Form | Violations found | Status |
|---|---|---|
| HomeworkForm | 2-column grid; 2 placeholders; 1 blended status msg | ✅ refactored to the standard (reference implementation) |
| PayForm (money) | 2 placeholders; amount format not stated | migrate to `useForm` + hints |
| SettingsForm | 2 placeholders (module cards) | migrate to `useForm` + hints |
| LoginTabs | 2 placeholders (email, phone) | migrate to `useForm` + format hints (+254…, email) |
| Upcoming: Staff Register form (Admin) | n/a | build on the standard from day one |

## The reference implementation (this repo)

`frontend/apps/web/src/components/Form.tsx` — small, dependency-free, and
the only way forms get built from now on:

- `Field` — label above, hint slot (format specs), per-field error slot,
  input-width utilities
- `useForm` hook — field state, submit handler, on-blur validation with the
  500ms rule, error collection, `aria-invalid` + `aria-describedby` wiring
- `ErrorSummary` — GOV.UK-style block: "There is a problem", anchor links
  to fields, keyboard focus moves to it on failed submit

Rules of engagement: **new forms MUST use it; refactors migrate to it;
the only acceptable deviation is a documented reason in this doc.**
