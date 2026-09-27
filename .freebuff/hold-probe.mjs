// Hold-probe: concurrent fire -> state snapshot -> independent recovery probe.
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

async function timed(url) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers: { cookie: COOKIE, ...HOST }, signal: AbortSignal.timeout(15_000) });
    await r.arrayBuffer();
    return `${r.status} in ${(performance.now() - t0).toFixed(0)}ms`;
  } catch (e) {
    return `ERR(${e.name}) at ${(performance.now() - t0).toFixed(0)}ms`;
  }
}

// Wave 1: 3 concurrent
const w1p = Promise.all([timed(`${API}/admin/pulse`), timed(`${API}/learners`), timed(`${API}/insights`)]);
// Wave 2 (+1s): 3 more
await new Promise((r) => setTimeout(r, 1000));
const w2p = Promise.all([timed(`${API}/admin/pulse`), timed(`${API}/learners`), timed(`${API}/insights`)]);
// Snapshot DB mid-hold
await new Promise((r) => setTimeout(r, 3000));
const pg = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo", max: 1 });
const snap = await pg.query(
  `SELECT state, count(*)::int n, coalesce(round(max(extract(epoch from now()-state_change))::numeric,0),0)::int max_s
   FROM pg_stat_activity WHERE datname='mandela_demo' AND application_name<>'HoldProbe' GROUP BY state ORDER BY state`
);
const lockwait = await pg.query(
  `SELECT count(*)::int n FROM pg_stat_activity WHERE datname='mandela_demo' AND wait_event_type='Lock'`
);
await pg.end();
console.log("DB mid-hold:", JSON.stringify(snap.rows), "lock-waiters:", lockwait.rows[0].n);

const [w1, w2] = await Promise.all([w1p, w2p]);
console.log("wave1:", JSON.stringify(w1));
console.log("wave2:", JSON.stringify(w2));

// After both settle: is the API still responsive?
console.log("after:", await timed(`${API}/admin/pulse`));
process.exit(0);
