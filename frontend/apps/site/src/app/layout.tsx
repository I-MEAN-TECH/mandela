import type { Metadata, Viewport } from "next";
import { Inter, Poppins, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

/** Same three families as the product — one voice everywhere. */
const inter = Inter({ subsets: ["latin"], variable: "--inter", display: "swap" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--poppins",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mandela-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://mandela.school"),
  title: {
    default: "Mandela — Run the school. See everything.",
    template: "%s · Mandela",
  },
  description:
    "The school platform built for Kenyan schools: fees, attendance, messages and operations in one calm place. Set up in a morning, learned in a day.",
  openGraph: {
    type: "website",
    siteName: "Mandela",
    title: "Mandela — Run the school. See everything.",
    description:
      "Fees, attendance, messages and operations in one calm place. Set up in a morning, learned in a day.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#102e26",
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Mandela",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "KES", description: "Per-learner monthly pricing" },
  description:
    "School management for Kenyan schools: fees, attendance, parent messaging on WhatsApp, and operations — one platform, learned in a day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
