#!/usr/bin/env node
/**
 * check-theme-colors.mjs — the no-hardcode law, enforced.
 *
 * The design system's contract (README "Non-negotiables" + tokens.css):
 * hex colors live in ONE place — frontend/packages/ui/tokens.css (the
 * product's single source of visual truth) — plus the deliberate theme-math
 * helpers and swatch palettes listed below. Anywhere else, a hex literal is
 * a drift bug: a screen that will ignore the school's brand, or a "quick
 * tint" that breaks the ink-and-paper system.
 *
 * Usage:
 *   node scripts/check-theme-colors.mjs            # check, exit 1 on drift
 *   node scripts/check-theme-colors.mjs --list     # print allowlist and exit
 *
 * Allowlist policy — a file passes if EVERY hex it contains is either:
 *   1. in tokens.css (the token definitions themselves), or
 *   1b. in TOKEN_MIRROR_FILES (the TS mirror of tokens.css for NativeWind —
 *       same values, no CSS cascade on mobile), or
 *   2. in THEME_MATH_FILES (pure color math over already-tokenized hexes,
 *      e.g. deriveAmbient mixing the school's chosen primary), or
 *   3. in THEME_SWATCH_FILES (the Settings swatch picker — school *data*,
 *      each swatch is a value an admin can choose, not a hardcoded style).
 *
 * Add a file only with a comment in the PR explaining why raw hex is the
 * point of that file.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** The single source of visual truth. */
const TOKENS_FILE = "frontend/packages/ui/tokens.css";

/** Token mirrors — TS copies of tokens.css for surfaces without a CSS cascade
 *  (NativeWind/Expo reads constants directly). Must stay in sync with tokens.css. */
const TOKEN_MIRROR_FILES = [
  "frontend/packages/ui/src/theme.ts",
];

/** Color math modules — they transform hexes (mix/derive), never style with them. */
const THEME_MATH_FILES = [
  "frontend/apps/web/src/lib/schoolTheme.ts",
];

/** School-choice swatch palettes — data for the admin's theme editor. */
const THEME_SWATCH_FILES = [
  "frontend/apps/web/src/app/app/settings/ThemeEditor.tsx",
];

/** Scan these extensions (source surfaces that render or style UI). */
const EXTS = new Set([".ts", ".tsx", ".css", ".scss", ".js", ".jsx", ".mjs", ".cjs"]);

/** Directories never scanned (deps, build output, dot-dirs, non-UI surfaces). */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "coverage",
  ".freebuff", ".agents", "deploy",
]);

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Collect every hex literal in a file as { line, hex }. */
function findHexes(absPath) {
  const src = readFileSync(absPath, "utf8");
  const out = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    // Strip line comments so mentions like `// #123b31 is brand-deep` don't count.
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    for (const m of code.matchAll(HEX_RE)) out.push({ line: i + 1, hex: m[0] });
  });
  return out;
}

/** Walk a directory tree, yielding source files as repo-relative paths. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue; // dot-dirs (.next, .turbo, …)
    const abs = join(dir, entry);
    const rel = abs.slice(ROOT.length + 1).split(sep).join("/");
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(abs);
    } else if (EXTS.has(ext(entry))) {
      yield rel;
    }
  }
}

function ext(name) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i);
}

const ALLOWED = new Set([TOKENS_FILE, ...TOKEN_MIRROR_FILES, ...THEME_MATH_FILES, ...THEME_SWATCH_FILES]);

if (process.argv.includes("--list")) {
  console.log("Theme hex allowlist:");
  for (const f of ALLOWED) console.log("  " + f);
  process.exit(0);
}

const offenders = [];
let scanned = 0;

for (const surface of ["frontend", "mobile", "desktop", "scripts"]) {
  const dir = join(ROOT, surface);
  let st;
  try { st = statSync(dir); } catch { continue; }
  if (!st.isDirectory()) continue;
  for (const rel of walk(dir)) {
    if (ALLOWED.has(rel)) continue;
    scanned++;
    const hexes = findHexes(join(ROOT, rel));
    if (hexes.length) offenders.push({ file: rel, hexes });
  }
}

if (offenders.length === 0) {
  console.log(`✓ theme-colors check passed — ${scanned} source files, hex only in the allowlist (${ALLOWED.size} files).`);
  process.exit(0);
}

console.error(`✗ theme-colors check FAILED — raw hex outside the theme allowlist in ${offenders.length} file(s).\n`);
console.error("Every color must come from a design token (var(--…)). Raw hex belongs only in:");
for (const f of ALLOWED) console.error("  " + f);
console.error("");
for (const { file, hexes } of offenders) {
  console.error(`${file}`);
  for (const h of hexes.slice(0, 8)) console.error(`   line ${h.line}: ${h.hex}`);
  if (hexes.length > 8) console.error(`   …and ${hexes.length - 8} more`);
}
console.error("\nFix: replace the hex with its token (e.g. var(--pine-700)), or — if this file is");
console.error("deliberate color math / school swatch data — add it to the allowlist in");
console.error("scripts/check-theme-colors.mjs with a one-line justification.");
process.exit(1);
