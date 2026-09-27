import { NextRequest, NextResponse } from "next/server";

/**
 * Registration proxy — mirrors /api/auth: the API owns validation and the
 * session cookie; this handler relays and re-sets the cookie on success.
 * The join code picks the tenant, so unlike other routes we do NOT forward
 * a school host for staff joins (no school exists for a fresh signup yet).
 * The admin claim runs against the freshly provisioned tenant, whose host
 * the setup flow already established — the API's dev fallback resolves it.
 */
const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

type RegBody = {
  kind?: "lookup" | "staff" | "school";
  fullName?: string;
  email?: string;
  phone?: string;
  role?: string;
  code?: string;
  password?: string;
  schoolName?: string;
  alsoPrincipal?: boolean;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RegBody;

  // 1) Code lookup — pure relay, no cookie involved.
  if (body.kind === "lookup") {
    const r = await fetch(`${API_URL}/web/auth/school-by-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: body.code ?? "" }),
      cache: "no-store",
    });
    const data = (await r.json()) as { ok: boolean; name?: string; error?: string };
    if (!data.ok) return NextResponse.json({ ok: false, error: data.error ?? "Unknown school code" });
    return NextResponse.json({ ok: true, name: data.name });
  }

  // 2) Staff join — the API resolves the tenant from the code.
  if (body.kind === "staff") {
    const r = await fetch(`${API_URL}/web/auth/register-staff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: body.fullName,
        email: body.email,
        phone: body.phone || undefined,
        role: body.role,
        code: body.code,
        password: body.password,
      }),
      cache: "no-store",
    });
    const data = (await r.json()) as { ok: boolean; error?: string; role?: string };
    if (!data.ok) return NextResponse.json({ ok: false, error: data.error ?? "Could not join" }, { status: 200 });
    const res = NextResponse.json({ ok: true, role: data.role });
    const cookie = r.headers.get("set-cookie");
    if (cookie) res.headers.append("set-cookie", cookie);
    return res;
  }

  // 3) School claim — forwarded on the current tenant host (fresh DB).
  if (body.kind === "school") {
    const cookieTenant = req.cookies.get("mandela_tenant")?.value;
    const host = cookieTenant ? `${cookieTenant}.mandela.school` : req.headers.get("host") ?? undefined;
    const r = await fetch(`${API_URL}/web/auth/register-school`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(host ? { "x-mandela-host": host } : {}),
      },
      body: JSON.stringify({
        fullName: body.fullName,
        schoolName: body.schoolName,
        email: body.email,
        phone: body.phone || undefined,
        password: body.password,
        alsoPrincipal: body.alsoPrincipal ?? false,
        provisionToken: process.env.MANDELA_PROVISION_TOKEN ?? "mandela_dev_provision_token",
      }),
      cache: "no-store",
    });
    const data = (await r.json()) as { ok: boolean; error?: string; joinCode?: string };
    if (!data.ok) return NextResponse.json({ ok: false, error: data.error ?? "Could not set up the school" }, { status: 200 });
    const res = NextResponse.json({ ok: true, joinCode: data.joinCode });
    const cookie = r.headers.get("set-cookie");
    if (cookie) res.headers.append("set-cookie", cookie);
    return res;
  }

  return NextResponse.json({ ok: false, error: "Unknown registration kind" }, { status: 400 });
}
