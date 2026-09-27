// D9 — bundle-budget check (PLATFORM-PLAN §8.4, System completion).
// Fails the build when a web route's first-load JS exceeds the budget.
// Usage: node .freebuff/bundle-budget.mjs [root=.next dir] [budgetKB=250]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const WEB = "frontend/apps/web";
const NEXT = path.join(WEB, ".next");
const BUDGET_KB = Number(process.argv[3] ?? 250); // spec: first-load JS < 250 kB gzip per route
const UI_DIR = "frontend/packages/ui/src";

if (!fs.existsSync(NEXT)) {
  console.error("no .next build found — run `pnpm --filter @mandela/web build` first");
  process.exit(2);
}

// 1) Route budgets from the app manifests. Next prints "First Load JS" per
// route in build output; the machine-readable source is the app build
// manifest → we sum the page's chunk file sizes, gzipped.
const manifest = JSON.parse(fs.readFileSync(path.join(NEXT, "server", "app-paths-manifest.json"), "utf8"));
const buildManifest = JSON.parse(fs.readFileSync(path.join(NEXT, "app-build-manifest.json"), "utf8"));

function gz(p) {
  const buf = fs.readFileSync(p);
  return zlib.gzipSync(buf, { level: 9 }).length;
}

let fail = 0;
const rows = [];
for (const [route, pageFile] of Object.entries(manifest)) {
  // app-paths-manifest keys equal the app-build-manifest keys (e.g. "/app/page")
  const key = route;
  const files = buildManifest.pages[key] ?? [];
  const js = files.filter((f) => f.endsWith(".js"));
  let totalGz = 0;
  for (const f of js) {
    const p = path.join(NEXT, f);
    if (fs.existsSync(p)) totalGz += gz(p);
  }
  const kb = Math.round(totalGz / 1024);
  rows.push({ route, kb });
  if (kb > BUDGET_KB) {
    fail++;
    console.log(`  OVER  ${route} — ${kb} kB > ${BUDGET_KB} kB budget`);
  }
}
rows.sort((a, b) => b.kb - a.kb);
for (const r of rows.slice(0, 5)) console.log(`  top   ${r.route} — ${r.kb} kB gzip`);
console.log(`routes: ${rows.length} · over budget: ${fail} (budget ${BUDGET_KB} kB gzip first-load JS)`);

// 2) UI package stays dependency-free (ponytail law: no chart/runtime deps).
const uiPkg = JSON.parse(fs.readFileSync("frontend/packages/ui/package.json", "utf8"));
const deps = { ...(uiPkg.dependencies ?? {}), ...(uiPkg.peerDependencies ?? {}) };
const uiOffenders = Object.keys(deps).filter(
  (d) => d !== "react" && d !== "react-dom" && d !== "motion" && !d.startsWith("@types"),
);
if (uiOffenders.length) {
  fail++;
  console.log(`  OVER  @mandela/ui gained dependencies: ${uiOffenders.join(", ")}`);
} else {
  console.log("  ok    @mandela/ui dependency-free");
}

process.exit(fail ? 1 : 0);
