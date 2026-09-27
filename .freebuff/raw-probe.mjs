// One-shot raw HTTP probe: full request -> response or timeout, both ports.
import net from "node:net";

function probe(port, path, extra = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect(port, "127.0.0.1");
    const headers = [`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, "Connection: close", ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n");
    let buf = "";
    const done = (what) => { try { s.destroy(); } catch {} resolve({ what, ms: Date.now() - t0, head: buf.slice(0, 40).replace(/\r\n/g, " ") }); };
    s.setTimeout(8000, () => done("TIMEOUT"));
    s.on("connect", () => { s.write(headers); console.log(`[${port}${path}] connected at ${Date.now() - t0}ms, request sent`); });
    s.on("data", (d) => { buf += d.toString("latin1"); if (buf.includes("\r\n\r\n") || buf.length > 200000) done("RESPONSE"); });
    s.on("error", (e) => done("ERR " + e.message));
  });
}

console.log("3101 /login:", JSON.stringify(await probe(3101, "/login")));
console.log("3101 / :", JSON.stringify(await probe(3101, "/")));
console.log("4000 /web/pulse:", JSON.stringify(await probe(4000, "/web/pulse", { "x-mandela-host": "demo.mandela.school" })));
process.exit(0);
