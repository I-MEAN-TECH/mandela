import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        // AI training crawlers excluded per SEO skill guidance; search stays open
        userAgent: ["GPTBot", "CCBot", "Google-Extended"],
        disallow: "/",
      },
    ],
    sitemap: "https://mandela.school/sitemap.xml",
  };
}
