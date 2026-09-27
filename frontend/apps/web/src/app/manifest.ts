import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { deriveAmbient, isHex6, PRODUCT_DEFAULTS } from "@/lib/schoolTheme";

const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";

/**
 * Per-school PWA manifest — the installable-app identity is DATA, like every
 * other brand surface. On a SaaS subdomain it carries the school's name and
 * colors; on an enterprise custom domain the school's own brand IS the app.
 * Falls back to the platform defaults when the tenant DB is unreachable.
 */

interface BootMini {
  school: { name: string };
  theme: Record<string, string>;
}

async function loadSchool(host: string): Promise<BootMini | null> {
  try {
    const r = await fetch(`${API_URL}/web/bootstrap`, {
      headers: { "x-mandela-host": host },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as BootMini;
  } catch {
    return null;
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const host = h.get("x-mandela-host") ?? h.get("host") ?? "";
  const boot = await loadSchool(host);

  const name = boot?.school.name ?? "Mandela School";
  // Same derivation the app renders with — installed-app chrome (splash,
  // titlebar, task switcher) wears the school's deep shade + canvas.
  const derived = deriveAmbient(boot?.theme);
  const themeColor =
    isHex6(boot?.theme["brand-deep"]) ? boot!.theme["brand-deep"]!
    : isHex6(derived["brand-deep"]) ? derived["brand-deep"]
    : PRODUCT_DEFAULTS.deep;
  const bg =
    isHex6(boot?.theme.bg) ? boot!.theme.bg
    : isHex6(derived.bg) ? derived.bg
    : PRODUCT_DEFAULTS.panel;

  return {
    // Stable identity: install/update treats every host variant as ONE app.
    id: "/app?source=pwa",
    name,
    short_name: name.split(/\s+/).slice(0, 2).join(" "),
    description: "The school operating system — money, people, academics, operations.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: bg,
    theme_color: themeColor,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android adaptive icon: artwork inside the 80% safe zone on the
        // deep-pine field — the OS may mask it to circle/squircle/blob.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
