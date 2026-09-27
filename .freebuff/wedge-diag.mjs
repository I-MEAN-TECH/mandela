// Wedge diagnostics: CPU delta + unknown-route probe during a concurrent storm.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");

// 1. Find API PID
const out = execSync('netstat -ano | findstr ":4000" | findstr LISTENING').toString();
const pid = out.trim().split(/\s+/).pop();
console.log("API PID:", pid);

const cpu = () => {
  const r = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid}).CPU"`).toString().trim();
  return parseFloat(r);
};

const HOST = { "x-mandela-host": "demo.mandela.school" };
const API = "http://127.0.0.1:4000/web";
const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];
console.log("logged in, COOKIE set:", !!COOKIE);

async function timed(url, ms = 6000) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers: { cookie: COOKIE, ...HOST }, signal: AbortSignal.timeout(ms) });
    await r.arrayBuffer();
    return `${r.status} in ${(performance.now() - t0).toFixed(0)}ms`;
  } catch (e) {
    return `ERR(${e.name}) at ${(performance.now() - t0).toFixed(0)}ms`;
  }
}

console.log("baseline pulse:", await timed(`${API}/admin/pulse`));

// 2. CPU before storm
const c0 = cpu();

// 3. Storm: 12 concurrent, but do NOT await them yet
const storm = Promise.all(
  Array.from({ length: 12 }, (_, i) => timed(`${API}/admin/pulse`, 12_000))
);

// 4. While storm is in flight, probe an UNKNOWN route (404 path) and baseline again
await new Promise((r) => setTimeout(r, 1500));
const unknownProbe = await timed(`${API}/definitely-not-a-route-xyz`, 6000);
const c1 = cpu();
console.log(`unknown route during storm: ${unknownProbe}`);
console.log(`CPU delta over storm window: ${(c1 - c0).toFixed(2)}s (PID ${pid})`);

const results = await storm;
console.log("storm results:", JSON.stringify(results, null, 0));
console.log("after storm, pulse:", await timed(`${API}/admin/pulse`));
process.exit(0);
