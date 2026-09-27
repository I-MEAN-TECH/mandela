import fs from "node:fs";

const p = "backend/apps/api/src/web/web.controller.ts";
let c = fs.readFileSync(p, "utf8");

const roles = ["bursar", "principal", "counter", "driver", "dorm_parent", "janitor", "librarian", "patron"];
let count = 0;
for (const r of roles) {
  const fnName = r === "principal" ? "principalPulse" : r + "Pulse";
  const oldFn = "    return rolePulse." + fnName + "(tenant.dbName, principal);";
  const newFn =
    "    const rollup = await freshRollup(tenant.dbName, \"" + r + "\");\n" +
    "    if (rollup) return rollup as never; // fresh rollup (D4) — identical payload shape\n" +
    "    return rolePulse." + fnName + "(tenant.dbName, principal);";
  if (c.includes(oldFn)) {
    c = c.replace(oldFn, newFn);
    count++;
  }
}
if (!c.includes("freshRollup } from")) {
  c = c.replace(
    'import * as pdf from "./pdf.js";',
    'import * as pdf from "./pdf.js";\nimport { freshRollup } from "./rollupWorker.js";',
  );
}
fs.writeFileSync(p, c);
console.log("pulse GETs rolled up:", count, "| import:", c.includes("freshRollup } from"));
