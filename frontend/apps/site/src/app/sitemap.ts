import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://mandela.school";
  const routes = ["", "/product", "/for-schools", "/for-teachers", "/for-parents", "/pricing", "/stories", "/about", "/contact", "/legal", "/start"];
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: new Date(),
    changeFrequency: r === "" ? "weekly" : "monthly",
    priority: r === "" ? 1 : r === "/pricing" || r === "/for-schools" ? 0.9 : 0.7,
  }));
}
