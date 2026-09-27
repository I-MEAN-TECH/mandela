import { cookies, headers } from "next/headers";

const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

/**
 * Server-side fetch for the /print/* document routes. Forwards the session
 * cookie and the school host so the API's own checks (money roles, guardian
 * own-child, draft-never-leaves) stay the single gatekeeper — the print page
 * adds layout, never permissions.
 */
export async function fetchPrintPayload<T>(path: string): Promise<T | { error: string }> {
  const jar = await cookies();
  const h = await headers();
  const host = h.get("host") ?? "";
  const tenant = jar.get("mandela_tenant")?.value;
  try {
    const r = await fetch(`${API_URL}${path}`, {
      headers: {
        cookie: `mandela_session=${jar.get(COOKIE)?.value ?? ""}`,
        "x-mandela-host": tenant ? `${tenant}.mandela.school` : host,
      },
      cache: "no-store",
    });
    return (await r.json()) as T | { error: string };
  } catch {
    return { error: "document unavailable" };
  }
}
