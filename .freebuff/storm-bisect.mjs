// Storm bisect: 10 -> 30 -> 50 concurrent, recovery check after each wave.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");
const { Pool } = require("pg");

const HOST = { "x-mandela-host": "demo.mandela.school" };
const API = "http://127.0.0.1:4000/web";

const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (!COOKIE) { console.error("no cookie"); process.exit(2); }

async function timed(url, ms) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers: { cookie: COOKIE, ...HOST }, signal: AbortSignal.timeout(ms) });
    await r.arrayBuffer();
    return { status: r.status, ms: performance.now() - t0 };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, err: e.name };
  }
}

async function dbSnap() {
  const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_control", max: 1 });
  const r = await p.query(
    `SELECT datname, state, count(*)::int n FROM pg_stat_activity
     WHERE datname IN ('mandela_control','mandela_demo') GROUP BY datname, state ORDER BY datname, state`
  );
  await p.end();
  return r.rows;
}

for (const size of [10, 30, 50]) {
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: size }, () => timed(`${API}/admin/pulse`, 12_000)));
  const dur = (performance.now() - t0) / 1000;
  const errs = results.filter((r) => r.status !== 200);
  const p95 = results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length * 0.95)];
  console.log(`storm ${size}: errs ${errs.length} · p95 ${p95.toFixed(0)}ms · wall ${dur.toFixed(1)}s`);
  if (errs.length) console.log("   sample:", JSON.stringify(errs[0]));

  // recovery check
  const after = await timed(`${API}/admin/pulse`, 8000);
  console.log(`   after: ${after.status === 200 ? "OK " + after.ms.toFixed(0) + "ms" : "WEDGED " + JSON.stringify(after)}`);
  if (after.status !== 200) {
    console.log("   db during wedge:", JSON.stringify(await dbSnap()));
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("db final:", JSON.stringify(await dbSnap()));
process.exit(0);
