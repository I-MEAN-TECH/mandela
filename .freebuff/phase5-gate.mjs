// Phase 5 gate — role dashboards wave 1 (docs/DEV-PHASES.md).
// Teacher/bursar/principal via demo seed logins; counter/driver via the
// Phase-1 join flow (join code MANDELA-A3XKG48N). Every pulse read goes
// through the real endpoint; role-gating and landing resolution asserted.
// NOTE: register-staff is rate-limited (10/hour/IP) — repeated runs within
// an hour will trip "Too many attempts" on the join step. That is the
// limiter working, not a regression; re-run after the window or on a fresh IP.
import { createRequire } from "node:module";
const req = createRequire(process.cwd() + "/backend/apps/api/package.json");
const pg = req("pg");

const API = "http://localhost:4000/web";
let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` (${extra})` : ""}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}

async function call(path, { method = "GET", token, body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `mandela_session=${token}` } : {}),
      "x-mandela-host": "demo.mandela.school",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => ({}));
}

/** register-staff sets the session via cookie only — capture set-cookie. */
async function registerStaff(body) {
  const r = await fetch(`${API}/auth/register-staff`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mandela-host": "demo.mandela.school" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const m = cookie.match(/mandela_session=([^;]+)/);
  return { ...json, token: m?.[1] ?? null };
}

const c = new pg.Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
await c.connect();

console.log("WAVE-1 SEED LOGINS (teacher, bursar, principal)");
const roles = {};
for (const [key, email] of [["teacher", "teacher@demo.mandela.school"], ["bursar", "bursar@demo.mandela.school"], ["principal", "principal@demo.mandela.school"]]) {
  const r = await call("/login/staff", { method: "POST", body: { email, password: "demo" } });
  ok(`${key} login`, r.ok === true, r.error ?? "");
  roles[key] = r.token ?? null;
}

console.log("\nTEACHER PULSE (§6.3)");
{
  const t = roles.teacher;
  if (!t) { fail++; console.log("  (skipped — no token)"); }
  else {
    const p = await call("/pulse/teacher", { token: t });
    ok("pulse/teacher returns shape", p && p.role === "teacher", JSON.stringify(p).slice(0, 90));
    ok("teacher KPIs present", typeof p.present === "number" && typeof p.homework_due_week === "number");
    ok("heatmap rows LIMIT-capped", Array.isArray(p.heatmap) && p.heatmap.length <= 40, `rows=${p.heatmap?.length}`);
    ok("days strip ≤ 10", Array.isArray(p.days) && p.days.length <= 10, `days=${p.days?.length}`);

    // Role-gating: a teacher cannot read the bursar pulse.
    const denied = await call("/pulse/bursar", { token: t });
    ok("teacher denied bursar pulse", Boolean(denied.error), denied.error ?? "");

    // Landing: teacher's perm_matrix has NO landing row → resolver falls back
    // to /app (class-today is phase-6 scope). Assert the resolver is total.
    const start = await call("/me/start", { token: t });
    ok("teacher start state resolves", start && start.landed === true, JSON.stringify(start).slice(0, 80));
  }
}

console.log("\nBURSAR PULSE (§6.4)");
{
  const t = roles.bursar;
  if (!t) { fail++; console.log("  (skipped — no token)"); }
  else {
    const p = await call("/pulse/bursar", { token: t });
    ok("pulse/bursar returns shape", p && p.role === "bursar", JSON.stringify(p).slice(0, 90));
    ok("collections KPIs numeric", /^\d+$/.test(String(p.collected_today_cents)) && /^\d+$/.test(String(p.billed_term_cents)));
    ok("7-day strip has 7 points", Array.isArray(p.week) && p.week.length === 7, `n=${p.week?.length}`);
    ok("confirmations feed LIMIT-capped", Array.isArray(p.confirmations) && p.confirmations.length <= 6);
    ok("arrears ladder present", Array.isArray(p.arrears));
  }
}

console.log("\nPRINCIPAL PULSE (§6.2)");
{
  const t = roles.principal;
  if (!t) { fail++; console.log("  (skipped — no token)"); }
  else {
    const p = await call("/pulse/principal", { token: t });
    ok("pulse/principal returns shape", p && p.role === "principal", JSON.stringify(p).slice(0, 90));
    ok("attendance_pct sane", p.attendance_pct === null || (p.attendance_pct >= 0 && p.attendance_pct <= 100));
    ok("14-day trend", Array.isArray(p.attendance_trend) && p.attendance_trend.length === 14, `n=${p.attendance_trend?.length}`);
    ok("absences by class present", Array.isArray(p.absences_by_class));
    ok("incidents by class present", Array.isArray(p.incidents_by_class));

    // Role-gating: principal cannot read the driver pulse.
    const denied = await call("/pulse/driver", { token: t });
    ok("principal denied driver pulse", Boolean(denied.error), denied.error ?? "");
  }
}

console.log("\nCOUNTER + DRIVER (join flow, §6.5–6.6)");
{
  // Join-code registration issues a session directly (Phase 1 seam).
  const stamp = Date.now().toString().slice(-8);
  const code = (await c.query("SELECT join_code FROM school_settings WHERE id = 'default'")).rows[0].join_code;
  const counter = await registerStaff({
    code, fullName: `Counter Gate ${stamp.slice(-4)}`, email: `counter.gate.${stamp}@e2e.mandela.school`,
    phone: `071${stamp}`, password: "GatePassw0rd", role: "counter",
  });
  ok("counter registered via join code", counter.ok === true, counter.error ?? "");
  const ct = counter.token;

  const driver = await registerStaff({
    code, fullName: `Driver Gate ${stamp.slice(-4)}`, email: `driver.gate.${stamp}@e2e.mandela.school`,
    phone: `072${stamp}`, password: "GatePassw0rd", role: "driver",
  });
  ok("driver registered via join code", driver.ok === true, driver.error ?? "");
  const dt = driver.token;

  if (ct) {
    const p = await call("/pulse/counter", { token: ct });
    ok("pulse/counter returns shape", p && p.role === "counter", JSON.stringify(p).slice(0, 90));
    ok("counter KPIs numeric", typeof p.visitors_on_site === "number" && typeof p.open_inquiries === "number");
    ok("funnel stages valid", Array.isArray(p.funnel) && p.funnel.every((s) => ["inquiry","visit","assessment","offered","enrolled"].includes(s.stage)), JSON.stringify(p.funnel));

    // Landing resolution: 042 seeds counter → today → /app (their OWN Today,
    // not the admin Pulse). The start endpoint confirms landing resolution.
    const land = await call("/me/land", { method: "POST", token: ct, body: {} });
    ok("counter confirm+land ok", land.ok === true, land.error ?? "");
    const start = await call("/me/start", { token: ct });
    ok("counter lands on /app (own Today)", start.landed === true && start.landing === "/app", JSON.stringify(start).slice(0, 90));
  }
  if (dt) {
    const p = await call("/pulse/driver", { token: dt });
    ok("pulse/driver returns shape", p && p.role === "driver", JSON.stringify(p).slice(0, 90));
    ok("driver KPIs numeric", typeof p.trips_today === "number" && typeof p.on_manifest === "number");
    ok("route strip LIMIT-capped", Array.isArray(p.route_stops) && p.route_stops.length <= 12);
    ok("manifest text-first", Array.isArray(p.manifest));
    const land = await call("/me/land", { method: "POST", token: dt, body: {} });
    ok("driver confirm+land ok", land.ok === true, land.error ?? "");
    const start = await call("/me/start", { token: dt });
    ok("driver lands on /app (own Today)", start.landed === true && start.landing === "/app", JSON.stringify(start).slice(0, 90));
  }
}

console.log("\nREGRESSION — admin + gates still intact");
{
  const r = await call("/login/staff", { method: "POST", body: { email: "admin@demo.mandela.school" } });
  ok("admin login still ok", r.ok === true);
  const pulse = await call("/admin/pulse", { token: r.token });
  ok("admin pulse unchanged", pulse && pulse.staff_active !== undefined);
  const denied = await call("/pulse/teacher", { token: r.token });
  ok("admin denied teacher pulse (separation)", Boolean(denied.error), denied.error ?? "");
}

console.log(`\n${fail === 0 ? "PHASE 5 GATE: ALL PASS" : "PHASE 5 GATE: FAILURES"} — ${pass} pass, ${fail} fail`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
