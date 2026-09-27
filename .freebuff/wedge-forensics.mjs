// Wedge forensics v2: sustained load -> wedge detection -> CDP stack samples.
import net from "node:net";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");
const { Pool } = require("pg");
const WebSocket = (await import("ws").catch(() => null))?.default;

const HOSTHEADER = "demo.mandela.school";
const API = "http://127.0.0.1:4000/web";

const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", "x-mandela-host": HOSTHEADER },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (!COOKIE) { console.error("no cookie"); process.exit(2); }

const pgd = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo", max: 1 });
const learnerId = (await pgd.query(`SELECT id::text FROM learner ORDER BY id LIMIT 1`)).rows[0]?.id;
await pgd.end();
if (!learnerId) { console.error("no learner row"); process.exit(2); }

const ALL = [
  ["pulse", `${API}/admin/pulse`],
  ["learners", `${API}/learners`],
  ["insights", `${API}/insights`],
  ["invoices", `${API}/admin/invoices/statement/${learnerId}`],
];
const MIX = process.env.TARGETS || "all";
const targets = MIX === "nopdf" ? ALL.filter(([n]) => n !== "invoices") : MIX === "pdfonly" ? ALL.filter(([n]) => n === "invoices") : ALL;
console.log("targets:", targets.map(([n]) => n).join(","));

// --- sustained load, N workers, capped at 45s ---------------------------------
const WORKERS = parseInt(process.env.WORKERS || "50", 10);
const stopAt = Date.now() + 45_000;
let inFlight = 0, maxInFlight = 0, done = 0, errors = 0;
let wedgeAt = 0;

async function worker(wid) {
  let i = wid;
  while (Date.now() < stopAt && !wedgeAt) {
    const [, url] = targets[i % targets.length];
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { cookie: COOKIE, "x-mandela-host": HOSTHEADER }, signal: AbortSignal.timeout(5_000) });
      await r.arrayBuffer();
      if (r.status !== 200) errors++;
    } catch { errors++; }
    inFlight--;
    done++;
    i += 7;
  }
}

// --- wedge sentinel: raw socket health every 2s (any status line = alive) ----
function rawHealth() {
  return new Promise((resolve) => {
    const s = net.connect(4000, "127.0.0.1");
    let ok = false;
    const fin = () => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(3000, fin);
    s.on("connect", () => s.write(`GET /web/pulse HTTP/1.1\r\nHost: 127.0.0.1:4000\r\nx-mandela-host: demo.mandela.school\r\nConnection: close\r\n\r\n`));
    s.on("data", (d) => { if (/HTTP\/1\.1 \d{3}/.test(d.toString("latin1"))) ok = true; fin(); });
    s.on("error", () => fin());
  });
}

const loadPromise = Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));

let badStreak = 0;
const t0 = Date.now();
while (Date.now() - t0 < 45_000 && !wedgeAt) {
  await new Promise((r) => setTimeout(r, 2000));
  const healthy = await rawHealth();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (!healthy) {
    badStreak++;
    console.log(`T+${secs}s: sentinel FAIL (${badStreak}) · done=${done} inflight=${inFlight} err=${errors}`);
    if (badStreak >= 2) {
      wedgeAt = Date.now() - t0;
      // Snapshot what the wedged backends were last doing, before the 60s timeout kills them.
      const pgd = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo", max: 1 });
      const snap = await pgd.query(
        `SELECT pid, state, wait_event_type wt, wait_event we,
                round(extract(epoch from now()-xact_start)::numeric,1) xact_s,
                round(extract(epoch from now()-query_start)::numeric,1) q_s,
                left(query,110) q
         FROM pg_stat_activity WHERE datname='mandela_demo' AND pid<>pg_backend_pid()
         ORDER BY backend_start`,
      ).catch((e) => ({ rows: [{ err: e.message }] }));
      await pgd.end();
      console.log("=== pg_stat_activity AT WEDGE ===");
      for (const r of snap.rows) console.log(" ", JSON.stringify(r));
    }
  } else {
    badStreak = 0;
  }
}

console.log(`load(WORKERS=${WORKERS}) done=${done} maxInFlight=${maxInFlight} errors=${errors} wedgeAt=${wedgeAt ? wedgeAt / 1000 + "s" : "never"}`);

if (!wedgeAt || !WebSocket) { console.log("no wedge (or no ws module) — nothing to dump"); process.exit(0); }

// --- attach CDP and sample paused stacks --------------------------------------
console.log("attaching inspector at 127.0.0.1:9230 ...");
const list = await fetch("http://127.0.0.1:9230/json/list").then((r) => r.json());
const wsUrl = list.find((t) => t.type === "node")?.webSocketDebuggerUrl ?? list[0]?.webSocketDebuggerUrl;
if (!wsUrl) { console.log("no inspector target"); process.exit(0); }

const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
let mid = 0;
const pending = new Map();
const events = [];
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
  else if (m.method === "Debugger.paused") events.push(m.params);
});
await new Promise((r) => ws.on("open", r));
await send("Debugger.enable");

for (let i = 0; i < 6; i++) {
  events.length = 0;
  await send("Debugger.pause");
  await new Promise((r) => setTimeout(r, 400));
  const ev = events[0];
  if (!ev) { console.log(`sample ${i}: no pause event`); continue; }
  console.log(`\n=== stack sample ${i} (${ev.callFrames.length} frames) ===`);
  for (const f of ev.callFrames.slice(0, 12)) {
    const url = (f.url || "").replace(/^.*[\\/]src[\\/]/, "src/");
    console.log(`  ${f.functionName || "(anon)"}  ${url || "(native)"}:${f.location.lineNumber + 1}`);
  }
  await send("Debugger.resume");
  await new Promise((r) => setTimeout(r, 150));
}
ws.close();
process.exit(0);
