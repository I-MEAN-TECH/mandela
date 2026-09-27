/**
 * School theme color math — ONE place for deriving the ambient chrome from
 * the school's chosen primary. theme_json stores only what the school picked
 * (primary + any explicit overrides); deriveAmbient fills the rest so
 * "choose blue" turns the whole shell blue — sidebar wash, deep panels,
 * login half, focus rings — while explicit theme keys always win.
 *
 * Plain hex math (no color-mix) so the derived values also work on older
 * browsers and can be embedded anywhere (PWA manifest theme_color).
 */

export function isHex6(v: string | undefined | null): v is string {
  return !!v && /^#[0-9a-fA-F]{6}$/.test(v);
}

/**
 * Product-default chrome colors — MUST mirror tokens.css (--brand-deep,
 * --bg). The single TS source for favicon/viewport/manifest fallbacks so
 * they can never drift from the CSS tokens again.
 */
export const PRODUCT_DEFAULTS = {
  deep: "#123b31",
  deepContrast: "#f2fbf5",
  bg: "#f7f9f2",
  panel: "#faf9f5",
} as const;

/** Derived deep panel (sidebar card, login half, browser chrome) for a primary. */
export function deepOf(primary: string): string {
  return mix(primary, "#000000", 0.42);
}

/** Derived sidebar/chrome wash for a primary. */
export function panelOf(primary: string): string {
  return mix(PRODUCT_DEFAULTS.panel, primary, 0.06);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Mix `a` toward `b` by t (0..1). t=0.42 → 42% of b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export type ThemeInput = Record<string, string | undefined>;

/**
 * Ambient overrides implied by the school's primary. Only fills gaps —
 * anything the school set explicitly passes through untouched. Returns
 * {} for no/invalid themes, so the product defaults stand.
 */
export function deriveAmbient(theme: ThemeInput | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!theme) return out;
  const p = theme.primary;
  if (!isHex6(p)) return out;
  if (!isHex6(theme["primary-hover"])) out["primary-hover"] = mix(p, "#000000", 0.18);
  if (!isHex6(theme["on-primary"])) out["on-primary"] = "#ffffff";
  // The deep panel (sidebar card, logo chip, login ink half) follows the hue.
  if (!isHex6(theme["brand-deep"])) {
    out["brand-deep"] = deepOf(p);
    out["brand-deep-contrast"] = PRODUCT_DEFAULTS.deepContrast;
    out["deep-line"] = mix(p, "#000000", 0.3);
  }
  // Sidebar / chrome wash — barely-there tint of the hue on the paper panel.
  if (!isHex6(theme["ambient-panel"])) out["ambient-panel"] = panelOf(p);
  // Public canvas (landing, login backdrop) takes an even fainter wash.
  if (!isHex6(theme.bg)) out.bg = mix("#f7f9f2", p, 0.05);
  if (!isHex6(theme.ring)) out.ring = mix("#ffffff", p, 0.2);

  // Positive state (StatusPill ok tone, the LIVE dot, ok meters) wears the
  // brand hue too — the pill keeps its check icon + text label, so meaning
  // survives a rebrand (colorblind-safe rule). Warn/danger stay product:
  // amber/red carry universal meaning no school should repaint.
  if (!isHex6(theme.ok)) out.ok = p;
  if (!isHex6(theme["ok-bg"])) out["ok-bg"] = mix("#ffffff", p, 0.12);

  // Accessory ramps (avatars, chips, chart bars, meters, focus rings, the
  // vivid button) — remapped so EVERYTHING wears the school's hue. Contrast
  // pairs move together (lime-100 bg ↔ pine-800 text), so AA holds.
  const ramp: [string, string][] = [
    ["lime-100", mix("#ffffff", p, 0.14)],
    ["lime-300", mix("#ffffff", p, 0.55)],
    ["lime-400", mix("#ffffff", p, 0.72)],
    ["lime-500", p],
    ["lime-600", mix(p, "#000000", 0.15)],
    ["lime-700", mix(p, "#000000", 0.35)],
    ["on-accent", "#ffffff"],
    ["pine-100", mix("#ffffff", p, 0.12)],
    ["pine-200", mix("#ffffff", p, 0.24)],
    ["pine-300", mix("#ffffff", p, 0.45)],
    ["pine-400", mix("#ffffff", p, 0.6)],
    ["pine-500", mix("#ffffff", p, 0.35)],
    ["pine-600", p],
    ["pine-700", mix(p, "#000000", 0.15)],
    ["pine-800", mix(p, "#000000", 0.3)],
    ["pine-900", mix(p, "#000000", 0.45)],
    ["pine-950", mix(p, "#000000", 0.6)],
  ];
  for (const [k, v] of ramp) if (!isHex6(theme[k])) out[k] = v;
  return out;
}
