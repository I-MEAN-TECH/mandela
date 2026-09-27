// Minimal node:http server — the platform wedge test target.
require("node:http").createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
}).listen(4321, "127.0.0.1", () => console.log("min server on 4321"));
setInterval(() => console.log("[min] alive", Date.now()), 5000).unref();
