import { ImageResponse } from "next/og";
import { deriveAmbient, isHex6, PRODUCT_DEFAULTS } from "@/lib/schoolTheme";

/**
 * Favicon as data — renders the school's own mark (school_settings) into a
 * 32px tile wearing the school's derived deep shade (theme is data; the
 * browser tab follows the same brand as the app). Falls back to the ink
 * square with an "M" when the DB is down.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
  let path: string | null = null;
  let theme: Record<string, string> | null = null;
  try {
    const r = await fetch(`${API_URL}/web/bootstrap`, { cache: "no-store" });
    if (r.ok) {
      const boot = (await r.json()) as {
        school?: { logo_svg_path?: string | null };
        theme?: Record<string, string>;
      };
      path = boot.school?.logo_svg_path ?? null;
      theme = boot.theme ?? null;
    }
  } catch {
    /* fallback below */
  }

  const derived = deriveAmbient(theme);
  const deep = isHex6(theme?.["brand-deep"])
    ? theme!["brand-deep"]
    : isHex6(derived["brand-deep"])
      ? derived["brand-deep"]
      : PRODUCT_DEFAULTS.deep;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: deep,
          color: PRODUCT_DEFAULTS.deepContrast,
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        {path ? (
          // The traced mark inherits currentColor via fill — render inline.
          <svg width="24" height="24" viewBox="0 0 100 100">
            <path d={path} fill={PRODUCT_DEFAULTS.deepContrast} />
          </svg>
        ) : (
          <span>M</span>
        )}
      </div>
    ),
    size,
  );
}
