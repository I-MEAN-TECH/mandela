// App-vs-platform discriminator: storm (a) 404 route (no DB, no app queries),
// (b) real pulse route — same client (node:http, fresh Agent), same concurrency.
import http from "node:http";

const HOSTHEADER = "demo.mandela.school";
const API = "127.0.0.1";
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function get(path, cookie, ms = 6000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.request(
      { host: API, port: 4000, path, method: "GET", agent, headers: { "x-mandela-host": HOSTHEADER, ...(cookie ? { cookie } : {}) } },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ s: res.statusCode, ms: Date.now() - t0 }));
      },
    );
    req.setTimeout(ms, () => { req.destroy(new Error("timeout")); });
    req.on("error", (e) => resolve({ s: 0, ms: Date.now() - t0, e: e.message }));
    req.end();
  });
}

// login via https? plain http
const cookie = await new Promise((resolve) => {
  const body = JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" });
  const req = http.request(
    { host: API, port: 4000, path: "/web/login/staff", method: "POST", agent, headers: { "content-type": "application/json", "x-mandela-host": HOSTHEADER, "content-length": Buffer.byteLength(body) } },
    (res) => {
      res.resume();
      res.on("end", () => resolve((res.headers["set-cookie"]?.[0] ?? "").split(";")[0]));
    },
  );
  req.on("error", () => resolve(""));
  req.end(body);
});
console.log("cookie:", !!cookie);

async function storm(name, path, useCookie, n) {
  const rs = await Promise.all(Array.from({ length: n }, () => get(path, useCookie ? cookie : null)));
  const errs = rs.filter((r) => r.s === 0).length;
  const p95 = rs.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rs.length * 0.95)];
  console.log(`${name}: n=${n} errs=${errs} p95=${p95}ms statuses=${[...new Set(rs.map((r) => r.s))].join("/")}`);
  return errs;
}

const e1 = await storm("404-storm   ", "/web/nope-xyz", false, 200);
console.log("after 404 storm, pulse:", JSON.stringify(await get("/web/admin/pulse", cookie, 8000)));
const e2 = await storm("pulse-storm ", "/web/admin/pulse", true, 200);
console.log("after pulse storm, pulse:", JSON.stringify(await get("/web/admin/pulse", cookie, 8000)));
process.exit(e1 || e2 ? 1 : 0);
