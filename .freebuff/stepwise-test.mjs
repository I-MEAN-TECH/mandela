// Stepwise: does a SINGLE learners/insights request stall?
const HOST = { "x-mandela-host": "demo.mandela.school" };
const API = "http://127.0.0.1:4000/web";

const l = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
});
const cookie = (l.headers.get("set-cookie") ?? "").split(";")[0];
console.log("login", l.status);

for (const path of ["/learners", "/insights"]) {
  const t0 = Date.now();
  try {
    const r = await fetch(API + path, { headers: { ...HOST, cookie }, signal: AbortSignal.timeout(20000) });
    const b = await r.text();
    console.log(path, r.status, `${Date.now() - t0}ms`, b.length, "bytes");
  } catch (e) {
    console.log(path, "ERR", `${Date.now() - t0}ms`, e.message);
  }
}
process.exit(0);
