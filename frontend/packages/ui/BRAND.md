# MANDELA Brand — the Green Ledger

> v6 (2026-09-11). The visual system is extracted from the approved reference
> dashboard (image-to-code pass): a **pale-sage room**, a **white rounded
> shell**, **deep pine** as the voice of text and action, and **lime** as the
> single bright accent. The logo mark still inherits `currentColor`, so it
> stays in harmony on every surface it touches.

## The palette and why

| Token | Hex | Role | Meaning |
|---|---|---|---|
| **Canvas `--bg`** | `#f7f9f2` | the sage-washed page behind the shell | The room, not a surface — content lives on white cards. |
| **Paper 50–400** | `#f2f4ec` → `#c8d0ba` | sidebar tint, wells, hairlines | `--border` = `#dfe4d4` — the reference's sage hairline. |
| **Pine 700** | `#1a5645` | `--primary`: buttons, the confident action | White label 7.4:1 (AAA). Deep green = trust + growth; it is the logo's new host color. |
| **Pine 900/950** | `#102e26` / `#0b211b` | headings, body text on light | Green-black ink — the reference's text cast. |
| **Lime 500** | `#8de24f` | `--accent`: the ONE vivid moment per screen — active nav pill, the bright action, chip wells | Lime is **energy, never status**. Dark pine label on lime (8.5:1, AAA). Never for paid/due/fail. |
| **Deep panel `--brand-deep`** | `#123b31` | the one deep-green anchor surface per screen (governance band, logo tile) | With `--brand-deep-contrast` `#f2fbf5`. |
| **Status ok** | `#1f9d5b` | paid / present / confirmed | The only green allowed to mean money. Paired with icon + text. |
| **Status warn** | `#b7791f` | due soon / needs attention | Amber says "look", never "fail". |
| **Status danger** | `#d64550` | overdue / failed / act now | Red means "act now" — always paired with icon + text. |

## Usage rules

1. **One primary action per screen** — `Button variant="primary"` is pine.
   The vivid moment (`variant="vivid"`, lime) appears **at most once** per
   screen, and never competes with a pine primary on the same view.
2. **Lime is navigation + energy, never status.** Nav pill, chip wells,
   meters, the single vivid action. Status keeps its own chroma
   (ok/warn/danger) and never borrows lime.
3. **NO GRADIENTS — anywhere.** Depth = hairline borders, 16px rounded
   corners, barely-there shadows (`--shadow-1/2`), and space. The reference
   is a flat, calm world; texture overlays are gone.
4. **The white shell** — the app renders inside a `rounded-[24px]` white
   container floating on the sage canvas (see AppShell). Cards are white on
   white, separated by hairlines and shadows — never gray-on-gray boxes.
5. **Shape:** cards 16px, inner rows/inputs 10px, buttons/chips 12px,
   status pills 8px. Rounded, but tighter than pill-everything.
6. **Dark mode** is the same room at night: deep pine surfaces, mint text,
   lime brightened. Tokens encode both; don't override per-screen.
7. Per-school theming may override tokens in `school_settings`, but the
   sage/pine/lime harmony is the product's voice.

## Where the tokens live

- `frontend/packages/ui/tokens.css` — CSS variables, light + dark (source of truth)
- `frontend/packages/ui/src/theme.ts` — TS mirror for NativeWind/Expo
- `frontend/packages/ui/tailwind.preset.ts` — Tailwind v4 utilities
- `globals.css` bridges everything into Tailwind's `@theme inline`

## Type + motion

- **Type:** Poppins for display + card headings (`.display`, `font-display`)
  — geometric, rounded, the reference's voice. Inter for dense UI text.
  Geist Mono for micro-labels (`.microlabel`) and tabular numerals (`.numeral`).
- **Shape of a page:** Poppins title (28px cap) → quiet sub → cards.
- **Motion:** one vocabulary; the signature ease is
  `cubic-bezier(.22,1,.36,1)`; the `.rise` stagger on dashboards
  (reduced-motion aware).
