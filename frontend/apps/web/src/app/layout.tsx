import type { Metadata, Viewport } from "next";
import { Inter, Poppins, Geist_Mono } from "next/font/google";
import { SwRegister } from "@/components/SwRegister";
import { viewBootstrapScript } from "@mandela/ui";
import { getBootstrapSafe } from "@/lib/api";
import { deriveAmbient, isHex6, PRODUCT_DEFAULTS } from "@/lib/schoolTheme";
import { ThemeVars } from "./ThemeVars";
import "./globals.css";

/** The reference's three families: Poppins display/headings · Inter UI · Geist Mono micro-labels. */
const inter = Inter({ subsets: ["latin"], variable: "--inter", display: "swap" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--poppins",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mandela-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Mandela — School Management, Rebuilt Simple",
  description:
    "Five modules. People · Money · Classroom · Talk · Insights. Zero training required.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: {
    // iOS ignores most of the manifest — these metas drive its A2HS sheet.
    capable: true,
    statusBarStyle: "default",
    title: "Mandela",
  },
};

/**
 * Browser chrome (Android status bar, desktop PWA titlebar) wears the
 * school's derived deep shade — theme is data, never hardcoded. Product
 * default deep pine when no theme is set.
 */
export async function generateViewport(): Promise<Viewport> {
  const boot = await getBootstrapSafe();
  const derived = deriveAmbient(boot?.theme);
  const themeColor =
    isHex6(boot?.theme["brand-deep"])
      ? (boot!.theme["brand-deep"] as string)
      : isHex6(derived["brand-deep"])
        ? derived["brand-deep"]
        : PRODUCT_DEFAULTS.deep;
  return { themeColor };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-school colors from school_settings.theme_json — null (no tenant/DB
  // down) simply means the product default tokens stand.
  const boot = await getBootstrapSafe();
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${poppins.variable} ${mono.variable}`}>
      <body>
        <ThemeVars theme={boot?.theme} />
        {children}
        <SwRegister />
        {/* View mode (Cards ⇄ List): apply the stored per-section choice
            before first paint — no flash of cards for list readers. */}
        <script dangerouslySetInnerHTML={{ __html: viewBootstrapScript }} />
      </body>
    </html>
  );
}
