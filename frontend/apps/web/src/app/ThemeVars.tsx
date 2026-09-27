/**
 * Per-school color overrides — the "theme is data, not code" law.
 * school_settings.theme_json maps token names to hex; rendered as CSS custom
 * property overrides on :root so EVERY screen (login included) repaints from
 * the database. Only brand-surface tokens may be overridden: the ok/warn/
 * danger semantics and the ink/paper neutral ramps stay product-owned, because
 * color never carries meaning alone (WCAG 2.1 AA) — a school rebrands its
 * identity, not its state colors.
 *
 * Values arrive pre-validated server-side (bootstrap SQL filters to #rrggbb
 * keys; the settings API zod-validates writes), so this stays a plain render.
 * Unknown keys and empty values are dropped here as a second guard. Ambient
 * derivation lives in lib/schoolTheme.ts (the single source of color math).
 */
import { deriveAmbient } from "@/lib/schoolTheme";

const ALLOWED = new Set([
  "primary", "primary-hover", "on-primary", "accent", "accent-hover",
  "accent-soft", "on-accent", "brand-deep", "brand-deep-contrast", "deep-line",
  "ring", "bg", "surface", "ambient-panel", "ok", "ok-bg",
  // Accessory ramps — remapped as a set by deriveAmbient so avatars, chips,
  // charts and meters follow the school hue with their contrast partners.
  ...["100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((s) => `pine-${s}`),
  ...["100", "300", "400", "500", "600", "700"].map((s) => `lime-${s}`),
]);

export function themeToStyle(theme: Record<string, string> | null | undefined):
  Record<string, string> {
  const out: Record<string, string> = {};
  if (!theme) return out;
  for (const [key, value] of Object.entries(theme)) {
    if (!ALLOWED.has(key)) continue;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) continue;
    out[`--${key}`] = value;
  }
  return out;
}

/**
 * School theme + derived ambient: choosing a primary implies the deep
 * panels, sidebar wash, canvas tint and focus ring (deriveAmbient fills
 * ONLY the gaps, so explicit school picks always win).
 */
export function ThemeVars({ theme }: { theme: Record<string, string> | null | undefined }) {
  const style = themeToStyle({ ...deriveAmbient(theme), ...theme });
  if (Object.keys(style).length === 0) return null;
  // One style tag on :root — cascades over tokens.css for the whole document.
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: `:root{${Object.entries(style).map(([k, v]) => `${k}:${v}`).join(";")}}` }}
    />
  );
}
