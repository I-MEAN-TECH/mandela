import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

/**
 * PDF proxy (System completion C13) — the report-card/statement PDFs stream
 * from the API (pdfkit), but the browser holds the session cookie on the web
 * origin only. Same forwarding law as /api/statement: cookie + tenant host go
 * to the API, bytes come back with content-disposition so the office can
 * save/email them. Admin/principal/bursar-only — the API enforces the floor.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const h = await headers();
  const host = h.get("host") ?? "";
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind") ?? "";
  // Final mile: "board-pack" streams the governors' A4 (no learner id).
  if (kindRaw === "board-pack") {
    try {
      const r = await fetch(`${API_URL}/web/print/pdf/board-pack`, {
        headers: { cookie: `mandela_session=${jar.get(COOKIE)?.value ?? ""}`, "x-mandela-host": host },
        cache: "no-store",
      });
      if (!r.ok) {
        const body = await r.text();
        return new NextResponse(body || "board pack unavailable", { status: r.status, headers: { "cache-control": "no-store" } });
      }
      return new NextResponse(r.body, {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="board-pack.pdf"`, "cache-control": "no-store" },
      });
    } catch {
      return NextResponse.json({ error: "board pack unavailable" }, { status: 502 });
    }
  }
  const kind = kindRaw === "statement" ? "statement" : "report-card";
  const learnerId = url.searchParams.get("learnerId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(learnerId)) {
    return NextResponse.json({ error: "bad learner id" }, { status: 400 });
  }
  const term = url.searchParams.get("term");
  const qs = term && /^\d+$/.test(term) ? `?term=${term}` : "";
  try {
    const r = await fetch(`${API_URL}/web/print/pdf/${kind}/${learnerId}${qs}`, {
      headers: {
        cookie: `mandela_session=${jar.get(COOKIE)?.value ?? ""}`,
        "x-mandela-host": host,
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const body = await r.text();
      return new NextResponse(body || "pdf unavailable", { status: r.status, headers: { "cache-control": "no-store" } });
    }
    const name = kind === "statement" ? "fee-statement" : "report-card";
    return new NextResponse(r.body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${name}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "pdf unavailable" }, { status: 502 });
  }
}
