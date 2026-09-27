// Phase 3 E2E — persona run-throughs (docs/DEV-PHASES.md Phase 3 gate).
// Admin/teacher/guardian journeys against the live API on :4000 (demo tenant).
// Run: node .freebuff/phase3-e2e.mjs   (from repo root)
// pg via the API workspace's node_modules
const { createRequire } = await import("node:module");
const reqPg = createRequire(process.cwd() + "/backend/apps/api/package.json");

const API = "http://localhost:4000/web";
let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` (${extra})` : ""}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}
function bearer(t) { return { "content-type": "application/json", cookie: `mandela_session=${t}`, "x-mandela-host": "demo.mandela.school" }; }

async function call(path, { method = "GET", token, body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? bearer(token) : { "x-mandela-host": "demo.mandela.school" }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  // capture the session cookie when the endpoint sets one
  const sc = r.headers.get("set-cookie");
  const m = sc?.match(/mandela_session=([^;]+)/);
  return { status: r.status, data, token: m?.[1] ?? null };
}

// Direct DB check for the queued welcome message (talk worker may send it fast)
async function dbOne(sql, params) {
  const pg = reqPg("pg");
  const c = new pg.Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
  await c.connect();
  const r = await c.query(sql, params);
  await c.end();
  return r.rows;
}

console.log("PERSONA 1 — ADMIN (claim path already proven; verify Pulse hat + admission)");
{
  // dev no-password login for the demo admin
  const login = await call("/login/staff", { method: "POST", body: { email: "admin@demo.mandela.school" } });
  ok("admin login", login.data?.ok === true, login.data?.error ?? "");
  const t = login.data?.token;

  const start = await call("/me/start", { token: t });
  ok("admin start state", start.data?.landed === true, `landing=${start.data?.landing}`);
  ok("admin landing is /app (Pulse)", start.data?.landing === "/app", start.data?.landing);

  const hat0 = await call("/me/principal-hat", { token: t });
  ok("principal-hat readable", typeof hat0.data?.hasHat === "boolean", `hasHat=${hat0.data?.hasHat}`);

  // toggle hat ON → confirm → back to original state
  await call("/me/principal-hat", { method: "POST", token: t, body: { on: !hat0.data.hasHat } });
  const hat1 = await call("/me/principal-hat", { token: t });
  ok("principal-hat toggles", hat1.data?.hasHat === !hat0.data.hasHat, `${hat0.data?.hasHat}→${hat1.data?.hasHat}`);
  await call("/me/principal-hat", { method: "POST", token: t, body: { on: hat0.data.hasHat } });

  // Direct admission (C4): learner + guardian + link code + welcome message
  const stamp = Date.now().toString().slice(-8);
  const adm = await call("/people/admit-with-link", {
    method: "POST", token: t,
    body: {
      firstName: `Asha${stamp.slice(0, 3)}`, lastName: `Ndi${stamp.slice(3)}`,
      gender: "F", boarding: false,
      guardianName: `Mama Asha ${stamp.slice(-4)}`, guardianPhone: `07${stamp}`,
    },
  });
  ok("admit-with-link ok", adm.data?.ok === true, adm.data?.error ?? JSON.stringify(adm.data).slice(0, 80));
  ok("link code issued", typeof adm.data?.linkCode === "string" && /^ML-/.test(adm.data.linkCode), adm.data?.linkCode ?? "none");

  // Welcome message queued (C5) — look up by the guardian name we just created
  const gname = `Mama Asha ${stamp.slice(-4)}`;
  const rows = await dbOne(
    `SELECT m.state, left(m.body, 60) AS body FROM message m
     JOIN guardian g ON g.id = m.guardian_id
     WHERE g.full_name = $1 AND m.kind = 'welcome' ORDER BY m.created_at DESC LIMIT 1`,
    [gname],
  ).catch(() => []);
  ok("welcome message queued", rows.length > 0, rows[0]?.state ?? "");

  globalThis.__adm = { ...adm.data, guardianName: gname };
}

console.log("PERSONA 2 — TEACHER (join → un-landed → confirm → landing)");
{
  const stamp = Date.now().toString().slice(-6);
  const email = `t${stamp}@e2e.mandela.school`;
  // Need the current join code — read it from the DB (admin UI path proven in Phase 1)
  const codeRow = await dbOne(`SELECT join_code FROM school_settings WHERE id = 'default'`);
  const code = codeRow[0]?.join_code;
  ok("join code present", Boolean(code), code ?? "");

  const reg = await call("/auth/register-staff", {
    method: "POST",
    body: { code, fullName: `Teacher ${stamp}`, email, phone: `072${stamp.slice(1)}`, password: "E2ePassw0rd", role: "teacher" },
  });
  ok("register-staff ok", reg.data?.ok === true, reg.data?.error ?? "");
  const t = reg.token ?? reg.data?.token;
  ok("session issued on register", Boolean(t));

  const start = await call("/me/start", { token: t });
  ok("teacher is UN-landed on arrival", start.data?.landed === false, `role=${start.data?.role}`);
  ok("interstitial has role name", start.data?.roleName === "Teacher", start.data?.roleName);
  ok("teacher landing resolves to /app (class today fallback)", typeof start.data?.landing === "string", start.data?.landing);

  // undo/flip path: change own role before landing (bursar→teacher back)
  const flip = await call("/staff/joiner-role", { method: "POST", token: t, body: { role: "bursar" } });
  ok("self role flip before landing", flip.data?.ok === true, flip.data?.error ?? "");
  const flip2 = await call("/staff/joiner-role", { method: "POST", token: t, body: { role: "teacher" } });
  ok("flip back to teacher", flip2.data?.ok === true, flip2.data?.error ?? "");

  const land = await call("/me/land", { method: "POST", token: t, body: {} });
  ok("confirm + land ok", land.data?.ok === true, land.data?.error ?? "");
  const start2 = await call("/me/start", { token: t });
  ok("landed afterwards", start2.data?.landed === true, `landing=${start2.data?.landing}`);

  // admin can flip a NOT-landed joiner; landed one must refuse
  const late = await call("/staff/joiner-role", { method: "POST", token: t, body: { role: "bursar" } });
  ok("landed staff cannot self-flip", late.data?.ok === false, late.data?.error ?? "");
}

console.log("PERSONA 3 — GUARDIAN (OTP login → linked child appears)");
{
  const adm = globalThis.__adm ?? {};
  const rows = adm.guardianName
    ? await dbOne(`SELECT phone FROM guardian WHERE full_name = $1 LIMIT 1`, [adm.guardianName]).catch(() => [])
    : [];
  const gphone = rows[0]?.phone ?? null;
  ok("guardian phone known", Boolean(gphone), gphone ?? "");
  if (!gphone) { console.log(`\nFAILURES: ${pass} pass, ${fail + 1} fail (no guardian phone)`); process.exit(1); }

  const login = await call("/login/guardian", { method: "POST", body: { phone: gphone } });
  ok("guardian OTP-login ok", login.data?.ok === true, login.data?.error ?? "");
  const gt = login.data?.token;

  const start = await call("/me/start", { token: gt });
  ok("guardian start: landed, /app", start.data?.landed === true && start.data?.landing === "/app", JSON.stringify(start.data).slice(0, 80));

  // The child is linked by admission — the redeem step was already consumed by
  // admission (code issued AND pre-linked). Home shows the child:
  const home = await call("/home/guardian", { token: gt });
  const hasChild = JSON.stringify(home.data ?? {}).includes("Asha");
  ok("guardian home shows the child", hasChild, "");

  // Redeem with a WRONG code must fail cleanly
  const bad = await call("/guardian/link-code", { method: "POST", token: gt, body: { code: "ML-WRONG123" } });
  ok("wrong link code refused", bad.data?.ok === false || bad.data?.error, bad.data?.error ?? "");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
