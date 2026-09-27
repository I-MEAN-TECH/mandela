// Wedge forensics: reproduce, then dump V8 stacks via CDP inspector.
import WebSocket from "ws";

const HOST = { "x-mandela-host": "demo.mandela.school" };
const API = "http://127.0.0.1:4000/web";

const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];

async function timed(ms) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}/admin/pulse`, { headers: { cookie: COOKIE, ...HOST }, signal: AbortSignal.timeout(ms) });
    await r.arrayBuffer();
    return `${r.status} ${(performance.now() - t0).toFixed(0)}ms`;
  } catch (e) { return `ERR(${e.name})`; }
}

console.log("warm:", await timed(5000));

// Reproduce: 30 concurrent, 20s timeout
console.log("storming 30 concurrent (20s cap)...");
const results = await Promise.all(Array.from({ length: 30 }, () => timed(20_000)));
const errs = results.filter((r) => r.startsWith("ERR")).length;
console.log(`storm: ${errs} errors of 30`);
if (errs === 0) { console.log("no wedge this run — rerun needed"); process.exit(0); }
console.log("wedge reproduced, attaching inspector...");

// Attach via CDP
const list = await fetch("http://127.0.0.1:9230/json/list").then((r) => r.json());
const wsUrl = list.find((t) => t.type === "node")?.webSocketDebuggerUrl ?? list[0].webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result ?? m.error); pending.delete(m.id); }
});
await new Promise((r) => ws.on("open", r));

await send("Debugger.enable");
const { calls: pauseCalls } = await send("Debugger.pause");
console.log("paused, dumping call stacks...");

const stacks = [];
for (let i = 0; i < 40; i++) {
  try {
    const frames = (await send("Debugger.getScriptSource", { scriptId: "0" }), null);
  } catch {}
  // Use Console to evaluate a stack dump for the paused call
  const evalRes = await send("Runtime.evaluate", {
    expression: `try { (new Error('probe')).stack } catch (e) { 'eval-failed' }`,
    includeCommandLineAPI: false,
  });
  stacks.push(evalRes?.result?.value ?? "n/a");
  await send("Debugger.resume").catch(() => undefined);
  await new Promise((r) => setTimeout(r, 80));
  await send("Debugger.pause").catch(() => undefined);
  await new Promise((r) => await0());
  function await0() { return new Promise((r2) => setTimeout(r2, 30)); }
}
for (const s of stacks.slice(0, 8)) console.log("--- stack sample ---\n" + s);
ws.close();
process.exit(0);
