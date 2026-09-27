// D9 — bundle-budget check (PLATFORM-PLAN §9, System completion).
// Fails when any web route's first-load JS exceeds the budget (kB gzip),
// and when @mandela/ui stops being dependency-free.
// Measures the PROD build only: requires .next/BUILD_ID (a `next dev`
// server overwrites .next with unminified chunks that would false-fail).
// Usage: pnpm --filter @mandela/web check:budget [budgetKB=200]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, ".."); // frontend/apps/web
const NEXT = path.join(WEB, ".next");
const UI_PKG = path.resolve(WEB, "../../packages/ui/package.json");
const BUDGET_KB = Number(process.argv[2] ?? 200); // spec §9: route JS < 200 kB gzip

if (!fs.existsSync(path.join(NEXT, "BUILD_ID"))) {
  console.error("no prod build found — run `pnpm --filter @mandela/web build` first (dev artifacts are not measured)");
  process.exit(2);
}

// First-load JS per route: the app build manifest lists each route's chunks;
// we gzip-sum the JS ones (Next's printed "First Load JS" is the same set).
const manifest = JSON.parse(fs.readFileSync(path.join(NEXT, "server", "app-paths-manifest.json"), "utf8"));
const buildManifest = JSON.parse(fs.readFileSync(path.join(NEXT, "app-build-manifest.json"), "utf8"));

function gz(p) {
  return zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length;
}

let fail = 0;
const rows = [];
for (const route of Object.keys(manifest)) {
  const files = buildManifest.pages[route] ?? [];
  let totalGz = 0;
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
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

// ui package stays dependency-free (ponytail law: no chart/runtime deps).
const uiPkg = JSON.parse(fs.readFileSync(UI_PKG, "utf8"));
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
