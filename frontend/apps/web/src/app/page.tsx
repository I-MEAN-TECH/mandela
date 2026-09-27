import { redirect } from "next/navigation";

/**
 * The product has one door: /app (which sends visitors on to /login).
 * The public brand site lives in frontend/apps/site — this root used to be
 * a per-school landing page; it was removed when the brand site took over
 * all public-facing presentation (owner decision, 2026-09-25).
 */
export default function RootPage() {
  redirect("/app");
}
