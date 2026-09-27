import { NextRequest, NextResponse } from "next/server";

/**
 * Auth route handler — sets/clears the session cookie directly (server
 * actions + cookie + redirect proved flaky; a route handler is exact).
 */
const API_URL = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const COOKIE = "mandela_session";

/** Mirror of api.ts hostToTenant (not importable: "use server" exports only). */
function hostToTenant(host: string | null): string | undefined {
  if (!host) return undefined;
  const sub = host.split(":")[0]!.split(".")[0]!;
  return sub && sub !== "localhost" && sub !== "www" && !/^\d+\.\d+\.\d+\.\d+$/.test(sub) ? sub : undefined;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: "staff" | "guardian";
    email?: string;
    password?: string;
    phone?: string;
  };

  const path = body.kind === "guardian" ? "/web/login/guardian" : "/web/login/staff";
  const payload =
    body.kind === "guardian"
      ? { phone: (body.phone ?? "").replace(/\s/g, "") }
      : { email: body.email ?? "", password: body.password || undefined };

  // Forward the tenant — without this, login resolves via the API's default
  // fallback and every non-default school fails to sign in.
  const tenant = req.cookies.get("mandela_tenant")?.value ?? hostToTenant(req.headers.get("host"));
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(tenant ? { "x-mandela-host": `${tenant}.mandela.school` } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = (await r.json()) as {
    ok: boolean; error?: string; token?: string; staff?: { needsPassword?: boolean };
  };

  if (!data.ok || !data.token) {
    return NextResponse.json({ ok: false, error: data.error ?? "Sign-in failed" }, { status: 401 });
  }

  // needsPassword = the account still has no password (legacy dev path).
  // The UI nudges the desk to set one; auth itself has succeeded.
  const res = NextResponse.json({ ok: true, needsPassword: data.staff?.needsPassword ?? false });
  res.cookies.set(COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
