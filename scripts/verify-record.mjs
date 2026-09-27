#!/usr/bin/env node
/**
 * verify-record — offline verifier for MANDELA portable records
 * (docs/RECORD-FORMAT.md). No DB, no network, no MANDELA install beyond
 * Node. Anyone — a bank, a bursary panel, another school, the ministry —
 * can prove a record is authentic and unmodified.
 *
 * Usage:
 *   node scripts/verify-record.mjs statement.mandela.json --key <hex-key>
 *   node scripts/verify-record.mjs statement.mandela.json --key-file key.hex
 *
 * Exit codes: 0 = VALID, 1 = INVALID, 2 = usage error.
 * No dependencies. Runs on any Node >= 18.
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args[0];
const keyIdx = args.indexOf("--key");
const keyFileIdx = args.indexOf("--key-file");

if (!file || (keyIdx === -1 && keyFileIdx === -1)) {
  console.error("usage: node scripts/verify-record.mjs <record.json> --key <hex> | --key-file <file>");
  process.exit(2);
}

const key = keyIdx >= 0 ? args[keyIdx + 1] : readFileSync(args[keyFileIdx + 1], "utf8").trim();

let envelope;
try {
  envelope = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.log("INVALID (unparseable JSON)");
  process.exit(1);
}

// --- canonical serialization: keys sorted lexicographically, recursively ---
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

// --- structure -------------------------------------------------------------
if (envelope.format !== "mandela.record.v1") {
  console.log("INVALID (unknown format)");
  process.exit(1);
}
const { signature, ...rest } = envelope;
if (!signature || signature.alg !== "HMAC-SHA256" || typeof signature.v !== "string") {
  console.log("INVALID (missing or malformed signature)");
  process.exit(1);
}
if (signature.v.length !== 64 || /[^0-9a-f]/.test(signature.v)) {
  console.log("INVALID (signature is not 64 hex chars)");
  process.exit(1);
}

// --- verify ----------------------------------------------------------------
const expected = createHmac("sha256", String(key)).update(canonical(rest)).digest("hex");
const a = Buffer.from(signature.v, "hex");
const b = Buffer.from(expected, "hex");
const ok = a.length === b.length && timingSafeEqual(a, b);

if (ok) {
  const learner = envelope.learner ?? {};
  console.log(
    `VALID — ${envelope.school?.name ?? "school"} · ${learner.admission_no ?? "?"} (${learner.first_name ?? "?"}) · ` +
      `${envelope.kind} · ${envelope.term?.name ?? ""} ${envelope.term?.year ?? ""} · ` +
      `issued ${envelope.issued_at}`,
  );
  process.exit(0);
} else {
  console.log("INVALID (signature does not match — the record was modified, or the key is wrong)");
  process.exit(1);
}

function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
