// Hammer the minimal server: 50 workers, zero think time, raw sentinel.
import net from "node:net";

function rawHealth() {
  return new Promise((resolve) => {
    const s = net.connect(4321, "127.0.0.1");
    let ok = false;
    const fin = () => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(2500, fin);
    s.on("connect", () => s.write("GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
    s.on("data", (d) => { if (d.toString("latin1").includes("200 OK")) ok = true; fin(); });
    s.on("error", () => fin());
  });
}

const stopAt = Date.now() + 20_000;
let done = 0, errors = 0, inFlight = 0, maxInFlight = 0;
async function worker() {
  while (Date.now() < stopAt) {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const r = await fetch("http://127.0.0.1:4321/", { signal: AbortSignal.timeout(4000) });
      await r.arrayBuffer();
      if (r.status !== 200) errors++;
    } catch { errors++; }
    inFlight--; done++;
  }
}
const load = Promise.all(Array.from({ length: 50 }, () => worker()));

let bad = 0, wedged = 0;
const t0 = Date.now();
while (Date.now() - t0 < 20_000 && !wedged) {
  await new Promise((r) => setTimeout(r, 2000));
  const h = await rawHealth();
  if (!h && ++bad >= 2) wedged = ((Date.now() - t0) / 1000).toFixed(1);
  else if (h) bad = 0;
  console.log(`T+${((Date.now() - t0) / 1000).toFixed(0)}s done=${done} inflight=${inFlight} err=${errors} sentinel=${h ? "ok" : "FAIL"}`);
}
await load;
console.log(`RESULT: done=${done} err=${errors} maxInFlight=${maxInFlight} wedgedAt=${wedged || "never"}s`);
process.exit(wedged ? 1 : 0);
