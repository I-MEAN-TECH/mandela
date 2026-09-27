// Abort test: do abandoned mid-flight requests wedge the API?
const HOST = { "x-mandela-host": "demo.mandela.school" };
const API = "http://127.0.0.1:4000/web";

const login = await fetch(`${API}/login/staff`, {
  method: "POST", headers: { "content-type": "application/json", ...HOST },
  body: JSON.stringify({ email: "admin@demo.mandela.school", password: "demo" }),
  signal: AbortSignal.timeout(10_000),
});
const COOKIE = (login.headers.get("set-cookie") ?? "").split(";")[0];
console.log("cookie:", !!COOKIE);

async function probe(tag) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}/admin/pulse`, { headers: { cookie: COOKIE, ...HOST }, signal: AbortSignal.timeout(8000) });
    await r.arrayBuffer();
    console.log(`${tag}: OK ${r.status} in ${(performance.now() - t0).toFixed(0)}ms`);
    return true;
  } catch (e) {
    console.log(`${tag}: WEDGED (${e.name}) at ${(performance.now() - t0).toFixed(0)}ms`);
    return false;
  }
}

await probe("baseline");

for (let round = 1; round <= 3; round++) {
  // fire 6 concurrent, abort ALL at ~300ms (mid-flight)
  const controllers = Array.from({ length: 6 }, () => new AbortController());
  const fires = controllers.map((c, i) =>
    fetch(`${API}/admin/pulse`, { headers: { cookie: COOKIE, ...HOST }, signal: c.signal })
      .then((r) => r.arrayBuffer().then(() => `done ${r.status}`))
      .catch((e) => `aborted(${e.name})`)
  );
  await new Promise((r) => setTimeout(r, 300));
  controllers.forEach((c) => c.abort());
  const outcomes = await Promise.all(fires);
  console.log(`round ${round}: ${outcomes.join(", ")}`);
  const healthy = await probe(`  health after round ${round}`);
  if (!healthy) { console.log("WEDGE REPRODUCED at round " + round); break; }
}
process.exit(0);
