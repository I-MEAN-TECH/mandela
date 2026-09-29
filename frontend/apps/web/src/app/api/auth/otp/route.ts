import { NextRequest, NextResponse } from "next/server";

/**
 * OTP login route — requests a 6-digit code and verifies it, then sets the
 * same session cookie the password-style login sets. Dev surfaces the code
 * in the response (production sends it via email/SMS/WhatsApp).
 */
const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

function hostToTenant(host: string | null): string | undefined {
  if (!host) return undefined;
  const sub = host.split(":")[0]!.split(".")[0]!;
  return sub && sub !== "localhost" && sub !== "www" && !/^\d+\.\d+\.\d+\.\d+$/.test(sub) ? sub : undefined;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "request" | "verify";
    identifier?: string;
    purpose?: "staff" | "guardian";
    code?: string;
  };
  const identifier = (body.identifier ?? "").trim();
  const purpose = body.purpose === "guardian" ? "guardian" : "staff";
  if (identifier.length < 3) {
    return NextResponse.json({ ok: false, error: "Enter your email or phone" }, { status: 400 });
  }

  const endpoint =
    body.action === "verify" ? "/web/auth/verify-code" : "/web/auth/request-code";

  const headers = new Headers({ "content-type": "application/json" });
  const tenant = req.cookies.get("mandela_tenant")?.value ?? hostToTenant(req.headers.get("host"));
  if (tenant) headers.set("x-mandela-host", `${tenant}.mandela.school`);
  const r = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ identifier, purpose, code: body.code ?? "" }),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    devCode?: string;
  };

  if (body.action === "verify") {
    const sessionCookie = r.headers.get("set-cookie");
    if (!data.ok || !sessionCookie) {
      return NextResponse.json({ ok: false, error: "That code did not match — request a fresh one." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.headers.append("set-cookie", sessionCookie);
    return res;
  }

  // request
  return NextResponse.json({
    ok: Boolean(data.ok),
    sent: data.ok,
    devCode: data.devCode,
    error: data.ok ? undefined : "Could not send a code — check the identifier",
  });
}
