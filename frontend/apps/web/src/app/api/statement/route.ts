import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

/**
 * Learner-term statement proxy (13) — lets the statement sheet fetch from
 * the browser without shipping server-only helpers to the client.
 * The session cookie is forwarded; the API enforces the money-role floor
 * AND (for guardians) the own-child check. Same payload as the server
 * component would read — one query, one truth.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const h = await headers();
  const host = h.get("host") ?? "";
  const learnerId = new URL(req.url).searchParams.get("learnerId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(learnerId)) {
    return NextResponse.json({ error: "bad learner id" }, { status: 400 });
  }
  try {
    const r = await fetch(`${API_URL}/web/admin/invoices/statement/${learnerId}`, {
      headers: {
        cookie: `mandela_session=${jar.get(COOKIE)?.value ?? ""}`,
        "x-mandela-host": host,
      },
      cache: "no-store",
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "statement unavailable" }, { status: 502 });
  }
}
