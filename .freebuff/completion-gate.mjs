// System-completion gate — B1/B2/C10/C11/C12/C13/D4/D5 verified LIVE.
// Runs against the demo tenant + the running API on :4000.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pg = require("../backend/apps/api/node_modules/pg");

const BASE = "http://localhost:4000";
const HOST = "demo.mandela.school";
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}
function jsonHeaders(token) {
  const h = { "content-type": "application/json", "x-mandela-host": HOST };
  if (token) h.cookie = `mandela_session=${token}`;
  return h;
}
async function api(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: jsonHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}
async function login(email, pw) {
  const r = await api("POST", "/web/login/staff", { email, password: pw });
  const cookie = r.headers.get("set-cookie") ?? "";
  const m = cookie.match(/mandela_session=([^;]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
console.log("== prologue: staff sessions ==");
const admin = await login("admin@demo.mandela.school", "demo");
ok("admin login", !!admin);
const teacher = await login("teacher@demo.mandela.school", "demo");
ok("teacher login", !!teacher);
const bursar = await login("bursar@demo.mandela.school", "demo");
ok("bursar login", !!bursar);

// ---------------------------------------------------------------------------
console.log("== D5 — term-scoped indexes exist ==");
const cs = new pg.Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
await cs.connect();
const idx = await cs.query(
  `SELECT indexname FROM pg_indexes WHERE indexname IN
   ('idx_attendance_day_learner','idx_payments_state_paid','idx_audit_at','idx_message_state_created')`,
);
ok("four perf indexes present", idx.rowCount === 4, `${idx.rowCount}/4`);

// ---------------------------------------------------------------------------
console.log("== B1 — staff broadcast ==");
{
  const r = await api("POST", "/web/announcements",
    { title: "Gate: staff channel check", body: "System-completion gate notice.", urgency: "update", audience: { staff: true } },
    admin);
  const j = await r.json();
  ok("staff broadcast accepted", r.ok && j.ok !== false, JSON.stringify(j).slice(0, 60));
}
{
  // teacher's pulse now carries the notice
  const r = await api("GET", "/web/pulse/teacher", null, teacher);
  const j = await r.json();
  ok("teacher pulse carries staff_notice", !!j.staff_notice, j.staff_notice?.title ?? "");
}
{
  const r = await api("GET", "/web/pulse/bursar", null, bursar);
  const j = await r.json();
  ok("bursar pulse carries staff_notice", !!j.staff_notice);
}

// ---------------------------------------------------------------------------
console.log("== C10 — term-scoped money ==");
{
  const r = await api("GET", "/web/pulse/bursar", null, bursar);
  const j = await r.json();
  ok("bursar pulse has term-scoped fields", "billed_term_cents" in j && "collected_term_cents" in j);
  ok("collected <= billed (term sanity)", Number(j.collected_term_cents) <= Number(j.billed_term_cents), `${j.collected_term_cents}/${j.billed_term_cents}`);
}

// ---------------------------------------------------------------------------
console.log("== C11 — pulse inline actions ==");
{
  const r = await api("GET", "/web/admin/pulse/actions", null, admin);
  const j = await r.json();
  ok("pulse actions endpoint", r.ok && Array.isArray(j.approvals) && Array.isArray(j.tasks), `approvals=${j.approvals?.length} tasks=${j.tasks?.length}`);
}
{
  // raise as TEACHER (the admin cannot decide their own request), decide as admin.
  // Use the raise response's id — matching the list can pick an older row.
  const raise = await api("POST", "/web/admin/approvals/raise",
    { requestType: "other", about: "Gate inline-action check", note: "raise" }, teacher);
  const raised = await raise.json().catch(() => ({}));
  const raisedId = raised.id ?? raised.approval?.id ?? null;
  if (!raisedId) {
    ok("raise returns id", false, JSON.stringify(raised).slice(0, 90));
  }
  const mine = raisedId ? { id: raisedId } : null;
  if (!mine) {
    // already handled above
  } else {
    const noReason = await api("POST", "/web/admin/approvals/decide", { id: mine.id, decision: "approved", reason: "no" }, admin);
    const noReasonBody = await noReason.json();
    ok("short reason rejected (reason law)", noReason.ok === false || noReasonBody.ok === false || !!noReasonBody.error);
    const dec = await api("POST", "/web/admin/approvals/decide", { id: mine.id, decision: "approved", reason: "gate: policy allows this" }, admin);
    const decBody = await dec.json().catch(() => ({}));
    if (!dec.ok || decBody.ok === false) {
      // gate raised it as admin; decide as the same admin — if still failing, surface why
      ok("inline decision lands", false, JSON.stringify(decBody).slice(0, 90));
    } else {
      ok("inline decision lands", true);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("== B2 — school health ==");
{
  const r = await api("GET", "/web/admin/health", null, admin);
  const j = await r.json();
  ok("health payload", r.ok && j.totals && Array.isArray(j.by_role), `staff=${j.totals?.staff} started=${j.totals?.started}`);
  ok("health is admin-gated", (await api("GET", "/web/admin/health", null, teacher)).json().then((b) => !!b.error));
}

// ---------------------------------------------------------------------------
console.log("== C12 — timetable auto-layout ==");
{
  const r = await api("POST", "/web/admin/timetable/autolayout", null, admin);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    ok("autolayout runs", false, (j.message ?? j.error ?? "").slice(0, 120));
  } else {
    ok("autolayout runs", typeof j.placed === "number", `placed=${j.placed} skipped=${j.skipped}`);
  }
}

// ---------------------------------------------------------------------------
console.log("== C13 — server PDFs ==");
{    const lr = await cs.query(`SELECT l.id::text FROM learner l ORDER BY l.id LIMIT 1`);
  if (!lr.rowCount) {
    ok("learner for pdf test", false, "no learner in demo");
  } else {
    const learnerId = lr.rows[0].id;
    const rc = await api("GET", `/web/print/pdf/report-card/${learnerId}`, null, admin);
    const rcBuf = Buffer.from(await rc.arrayBuffer());
    ok("report-card PDF bytes", rc.ok && rcBuf.length > 1000 && rcBuf.subarray(0, 4).toString() === "%PDF", `${rcBuf.length} bytes`);
    const st = await api("GET", `/web/print/pdf/statement/${learnerId}`, null, admin);
    const stBuf = Buffer.from(await st.arrayBuffer());
    ok("statement PDF bytes", st.ok && stBuf.length > 1000 && stBuf.subarray(0, 4).toString() === "%PDF", `${stBuf.length} bytes`);
    // web proxy path (cookie-forwarding route)
    const wr = await fetch("http://localhost:3000/api/pdf?kind=statement&learnerId=" + learnerId, { headers: { cookie: `mandela_session=${bursar}`, host: "demo.mandela.school:3000" } }).catch(() => null);
    if (wr) {
      const wBuf = Buffer.from(await wr.arrayBuffer());
      ok("web /api/pdf proxy streams", wr.ok && wBuf.subarray(0, 4).toString() === "%PDF", `${wBuf.length} bytes`);
    } else {
      console.log("  skip web /api/pdf proxy (web :3000 not up)");
    }
  }
}

// ---------------------------------------------------------------------------
console.log("== D4 — rollups ==");
{
  // worker cadence is 60s; a row refreshed within the last 3 minutes proves the loop lives
  const t = await cs.query(`SELECT COUNT(*)::int AS n, EXTRACT(EPOCH FROM (now()-MAX(refreshed_at)))::int AS age_s FROM role_pulse WHERE refreshed_at > now() - interval '3 minutes'`);
  ok("role_pulse rows refresh", t.rows[0].n > 0, `${t.rows[0].n} fresh · age ${t.rows[0].age_s}s`);
  const r = await api("GET", "/web/pulse/bursar", null, bursar);
  ok("bursar pulse serves", r.ok);
}

await cs.end();
console.log(`\n${pass}/${pass + fail}` + (fail ? ` — FAILURES: ${fails.join(" · ")}` : " — ALL GREEN"));
process.exit(fail ? 1 : 0);
