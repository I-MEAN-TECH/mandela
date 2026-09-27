import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Export proxy — forwards the admin session to the API's one-click full data
 * export (GET /web/admin/export) and streams the JSON download back. Mirrors
 * /api/pdf: same-origin for the browser, session forwarded server-side.
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const session = jar.get("mandela_session")?.value;
  const host = req.headers.get("x-mandela-host") ?? req.headers.get("host") ?? "";
  const target = new URL(req.nextUrl.toString());
  const api = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";
  const out = await fetch(`${api}/web/admin/export`, {
    headers: {
      "x-mandela-host": host,
      ...(session ? { cookie: `mandela_session=${session}` } : {}),
    },
  });
  if (!out.ok || !out.body) {
    return NextResponse.json({ error: `export failed (${out.status})` }, { status: out.status });
  }
  const cd = out.headers.get("content-disposition") ?? "attachment";
  const body = await out.text();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": cd,
      "x-target": target.host,
    },
  });
}
