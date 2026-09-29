import { DEFAULT_NAV, buildRoleNavigation } from "../web/queries.js";

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    failures += 1;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function main() {
  console.log("\nRole navigation contract");
  const nav = buildRoleNavigation([
    { role: "counter", module_key: "money" },
    { role: "counter", module_key: "operations" },
    { role: "counter", module_key: "insights" },
  ]);

  assert(
    JSON.stringify(nav.counter) === JSON.stringify(DEFAULT_NAV.counter),
    "Counter keeps its desk-only navigation when it has supporting read grants",
  );

  for (const [role, tabs] of Object.entries(nav)) {
    assert(tabs.length === new Set(tabs).size, `${role} navigation has no duplicate tabs`);
    assert(["Today", "Home"].includes(tabs[0] ?? ""), `${role} starts at its dashboard overview`);
  }

  if (failures) process.exitCode = 1;
  else console.log("Role navigation contract passed.");
}

main();
