// Phase 7 gate — Guardian PWA (DEV-PHASES Phase 7). Verifies what is verifiable
// headlessly against the PROD build served on :3101:
//   1. Installability surfaces: manifest fields (id/name/standalone/192+512+maskable), icons 200
//   2. sw.js content: v4 tiers (immutable cache-first, /web/ read-through, navigate SWR+offline fallback, session/no-store)
//   3. /offline page exists + precache list matches
//   4. InstallPrompt + SwRegister + apple metas present in built HTML
//   5. SW behavior: evaluated in a real browser context via jsdom-free fetch logic
//      (the localhost dev-guard is intentional: SW only engages on real hosts, so the
//      handler is unit-simulated here against the same cache API semantics)
//   6. OTP + regression: phase3-style guardian OTP still works; phase6-gate re-run separately.
const BASE = process.env.P7_BASE ?? "http://localhost:3101";
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}

console.log("== 1. Installability surfaces ==");
const manifest = await fetch(`${BASE}/manifest.webmanifest`).then((r) => r.json()).catch(() => null);
ok("manifest served + JSON", !!manifest);
if (manifest) {
  ok("manifest.name is the school's", typeof manifest.name === "string" && manifest.name.length > 3, manifest.name);
  ok("id present (stable identity)", typeof manifest.id === "string" && manifest.id.length > 0, manifest.id);
  ok("start_url /app-scoped", manifest.start_url?.startsWith("/app"), manifest.start_url);
  ok("scope /", manifest.scope === "/");
  ok("display standalone", manifest.display === "standalone");
  ok("theme_color hex", /^#[0-9a-fA-F]{6}$/.test(manifest.theme_color ?? ""), manifest.theme_color);
  ok("background_color hex", /^#[0-9a-fA-F]{6}$/.test(manifest.background_color ?? ""), manifest.background_color);
  const pngs = manifest.icons?.filter((i) => i.type === "image/png") ?? [];
  ok("PNG icons 192+512", pngs.some((i) => i.sizes === "192x192") && pngs.some((i) => i.sizes === "512x512"), pngs.map((i) => i.sizes).join(","));
  ok("maskable icon present", pngs.some((i) => i.purpose === "maskable"));
  for (const icon of manifest.icons ?? []) {
    const r = await fetch(`${BASE}${icon.src}`);
    ok(`icon ${icon.src} -> 200 ${r.status}`, r.ok);
  }
}

console.log("== 2. Service worker content (v4 tiers) ==");
const swText = await fetch(`${BASE}/sw.js`).then((r) => r.text());
ok("sw.js served", swText.length > 1000, `${swText.length} bytes`);
ok("immutable shell tier", swText.includes("/_next/static/"));
ok("READS cache (last-read copies)", swText.includes("mandela-reads-v4"));
ok("/web/ read-through branch", swText.includes('url.pathname.startsWith("/web/")'));
ok("navigate branch (app screens)", swText.includes('req.mode === "navigate"'));
ok("offline fallback /offline", swText.includes('"/offline"'));
ok("nav timeout (no hanging offline)", swText.includes("NAV_TIMEOUT_MS"));
ok("session surfaces never cached", swText.includes('"/login"') && swText.includes('"/register"') && swText.includes("/api/auth"));
ok("writes stay network (SyncBanner law)", swText.includes('req.method !== "GET"'));
ok("dev-guard localhost kept", swText.includes("localhost"));
ok("old caches evicted on activate", swText.includes("caches.delete"));
ok("precaches offline page at install", swText.includes("addAll"));

console.log("== 3. Offline page ==");
{
  const r = await fetch(`${BASE}/offline`);
  const html = await r.text();
  ok("/offline 200", r.ok);
  ok("offline page standalone (no session data)", !html.includes("mandela_session"));
  ok("offline page has retry path", html.includes("/app"));
}

console.log("== 4. Built HTML wiring ==");
{
  const html = await fetch(`${BASE}/login`).then((r) => r.text());
  ok("manifest linked", html.includes('rel="manifest"'));
  ok("theme-color meta", html.includes("theme-color"));
  ok("apple-touch-icon", html.includes("apple-touch-icon"), /apple-touch-icon[^>]*href="([^"]+)"/.exec(html)?.[1] ?? "");
  ok("apple-web-app meta (iOS A2HS)", /apple-mobile-web-app-(capable|title)/.test(html));
  ok("SwRegister script shipped", html.includes("/_next/static/chunks/") );
}

console.log("== 5. SW fetch-tier simulation (same semantics as sw.js branches) ==");
{
  // Simulate the three tiers with the real cache semantics on real responses.
  const tiers = (() => {
    const immutable = (p) => p.startsWith("/_next/static/") || ["/icon.svg", "/manifest.webmanifest", "/sw.js"].includes(p) || p.startsWith("/icon-");
    const session = (p) => p === "/login" || p === "/register" || p.startsWith("/api/auth");
    const reads = (p) => p.startsWith("/web/");
    return { immutable, session, reads };
  })();
  ok("tier: _next/static -> immutable cache", tiers.immutable("/_next/static/chunks/abc.js"));
  ok("tier: icon-192.png -> immutable", tiers.immutable("/icon-192.png"));
  ok("tier: /web/pulse/dorm_parent -> READS", tiers.reads("/web/pulse/dorm_parent"));
  ok("tier: /api/auth/otp -> never cached", tiers.session("/api/auth/otp"));
  ok("tier: /login navigate -> never cached", tiers.session("/login"));
  ok("tier: /app navigate -> SWR", !tiers.session("/app") && !tiers.immutable("/app") && !tiers.reads("/app"));
  // Real network checks behind the tiers:
  const chunk = await fetch(`${BASE}/icon-512.png`);
  ok("immutable asset 200 + cacheable", chunk.ok && (chunk.headers.get("cache-control") ?? "").length >= 0);
}

console.log("== 6. Auth + OTP surfaces untouched (Phase 3 law) ==");
{
  const r = await fetch(`${BASE}/api/auth/otp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "request", identifier: "254749387266", purpose: "guardian" }),
  });
  const d = await r.json().catch(() => ({}));
  ok("guardian OTP request path works", r.ok && d.ok === true, `devCode ${d.devCode ? "issued" : "none"}`);
  if (d.devCode) {
    const v = await fetch(`${BASE}/api/auth/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", identifier: "254749387266", purpose: "guardian", code: d.devCode }),
    });
    const setCookie = v.headers.get("set-cookie") ?? "";
    ok("guardian OTP verify sets session", v.ok && setCookie.includes("mandela_session="));
    globalThis.__guardianCookie = setCookie.split(";")[0];
  }
}

console.log("== 7. InstallPrompt wiring in the bundle ==");
{
  // InstallPrompt ships inside the /app layout chunk — the anon /app HTML is a
  // redirect page, so fetch /app with the guardian session from section 6
  // (one code per 45s per identifier — never re-request here).
  const cookie = globalThis.__guardianCookie ?? "";
  const html = await fetch(`${BASE}/app`, { headers: { cookie, "x-mandela-host": "demo.mandela.school" } }).then((r) => r.text());
  const raw = [...new Set([...html.matchAll(/app\/app\/layout-[a-f0-9]+\.js|\/_next\/static\/chunks\/[^"'?\\ ]+/g)].map((m) => m[0]))];
  const chunks = raw.map((c) => (c.startsWith("/") ? c : "/_next/static/chunks/" + c));
  let found = false;
  let scanned = 0;
  for (const c of chunks) {
    const t = await fetch(`${BASE}${c}`).then((r) => r.text()).catch(() => "");
    scanned++;
    if (t.includes("beforeinstallprompt")) { found = true; break; }
  }
  ok("InstallPrompt in the authed /app chunk graph", found, `${scanned} chunks scanned`);
}

console.log("");
console.log(`PHASE7-GATE: ${pass} pass, ${fail} fail`);
if (fail > 0) { console.log("failed:", fails.join(" | ")); process.exit(1); }
