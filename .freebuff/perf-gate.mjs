// Phase 9 perf gate v4 — self-contained: TTFB + 50-worker load + live server diagnostics.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");

const HOST = { "x-mandela-host": "demo.mandela.school" };
const WEB = "http://127.0.0.1:3101";
const API = "http://127.0.0.1:4000/web";
let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok    ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (!COOKIE) { console.error("no session — is the API up?"); process.exit(2); }

async function ttfb(url, headers = {}) {
  const t0 = performance.now();
  const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const reader = r.body.getReader();
  await reader.read();
  const first = performance.now() - t0;
  reader.cancel().catch(() => undefined);
  return { first, status: r.status };
}
async function timedGet(url, headers = {}) {
  const t0 = performance.now();
  const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ms: performance.now() - t0, bytes: buf.length };
}

console.log("A. Server TTFB (prod :3101) + 3G-corrected (400ms RTT + payload @400kbps):");
const loginRuns = [];
for (let i = 0; i < 5; i++) loginRuns.push(await timedGet(`${WEB}/login`));
const loginMed = loginRuns.map((s) => s.ms).sort((a, b) => a - b)[2];
const login3g = loginMed + 400 + (loginRuns[2].bytes * 8) / 400_000;
ok("login TTFB (3G-corrected) < 800ms", login3g < 800, `${loginMed.toFixed(0)}ms server · 3G≈${login3g.toFixed(0)}ms · ${(loginRuns[2].bytes / 1024).toFixed(0)}kB`);

const dashRuns = [];
for (let i = 0; i < 5; i++) dashRuns.push(await ttfb(`${WEB}/app`, { cookie: COOKIE, "x-mandela-host": "demo.mandela.school" }));
const dashMed = dashRuns.map((r) => r.first).sort((a, b) => a - b)[2];
ok("dashboard TTFB (3G-corrected) < 800ms", dashMed + 400 < 800, `${dashMed.toFixed(0)}ms first-chunk · 3G≈${(dashMed + 400).toFixed(0)}ms`);

const pulse = await timedGet(`${API}/admin/pulse`, { cookie: COOKIE, "x-mandela-host": "demo.mandela.school" });
const pulse3g = pulse.ms + 400 + (pulse.bytes * 8) / 400_000;
ok("pulse API (3G-corrected) < 800ms", pulse3g < 800 && pulse.status === 200, `${pulse.ms.toFixed(0)}ms server · 3G≈${pulse3g.toFixed(0)}ms · ${(pulse.bytes / 1024).toFixed(1)}kB`);

// --- B. load -------------------------------------------------------------------
console.log("\nB. Load: 50 workers × mixed reads, 15s, per-request timeout 5s:");
const { Pool } = require("pg");
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo", max: 1 });
const learnerId = (await p.query(`SELECT id::text FROM learner ORDER BY id LIMIT 1`)).rows[0].id;
await p.end();

const targets = [
  ["pulse", `${API}/admin/pulse`],
  ["learners", `${API}/learners`],
  ["insights", `${API}/insights`],
  ["invoices", `${API}/admin/invoices/statement/${learnerId}`],
];
for (const [name, url] of targets) {
  const r = await fetch(url, { headers: { cookie: COOKIE, "x-mandela-host": "demo.mandela.school" }, signal: AbortSignal.timeout(10_000) });
  await r.arrayBuffer();
  if (r.status !== 200) { console.error(`  preflight FAIL ${name}: ${r.status}`); process.exit(2); }
}
console.log("  preflight: all 4 targets 200");

const apiPid = execSync('netstat -ano | findstr ":4000" | findstr LISTENING').toString().trim().split(/\s+/).pop();
const cpu0 = parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${apiPid}).CPU"`).toString().trim());
console.log(`  api PID ${apiPid}, cpu0 ${cpu0.toFixed(2)}s`);

const results = [];
const stopAt = Date.now() + 15_000;
async function worker(wid) {
  let i = wid;
  while (Date.now() < stopAt) {
    const [name, url] = targets[i % targets.length];
    const t0 = performance.now();
    let status = 0;
    try {
      const r = await fetch(url, { headers: { cookie: COOKIE, "x-mandela-host": "demo.mandela.school" }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
      status = r.status;
      await r.arrayBuffer();
    } catch { status = 0; }
    results.push({ name, status, ms: performance.now() - t0 });
    i += 7;
  }
}
await Promise.all(Array.from({ length: 50 }, (_, w) => worker(w)));

const cpu1 = parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${apiPid}).CPU"`).toString().trim());
console.log(`  api CPU burned during load: ${(cpu1 - cpu0).toFixed(2)}s over 15s wall`);

const errs = results.filter((r) => r.status !== 200);
const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length * 0.5)], p95 = sorted[Math.floor(sorted.length * 0.95)];
ok("load: zero errors @ 50 VUs", errs.length === 0, `${results.length} reqs · ${(results.length / 15).toFixed(1)} rps · errors ${errs.length}${errs.length ? ` (timeouts ${errs.filter((e) => e.status === 0).length})` : ""}`);
ok("load: p95 < 800ms", p95 < 800, `p50 ${p50.toFixed(0)}ms · p95 ${p95.toFixed(0)}ms`);
const byName = {};
for (const r of results) (byName[r.name] ??= []).push(r);
for (const [name, arr] of Object.entries(byName)) {
  const s = arr.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`   ${name.padEnd(9)} n=${String(arr.length).padEnd(6)} p50 ${s[Math.floor(s.length * 0.5)].toFixed(0).padStart(5)}ms  p95 ${s[Math.floor(s.length * 0.95)].toFixed(0).padStart(5)}ms  err ${arr.filter((r) => r.status !== 200).length}`);
}

// C. recovery verdict — the 2026-09-27 wedge class must not exist anymore
const rec = await timedGet(`${API}/admin/pulse`, { cookie: COOKIE, "x-mandela-host": "demo.mandela.school" });
ok("recovery: pulse answers < 500ms right after load", rec.status === 200 && rec.ms < 500, `${rec.ms.toFixed(0)}ms`);

console.log(`\nperf gate: ${pass} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
