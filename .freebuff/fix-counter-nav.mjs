// One-off: add counter nav tabs to the demo tenant (mirrors seed-branding.ts change).
import { createRequire } from "node:module";
const req = createRequire(process.cwd() + "/backend/apps/api/package.json");
const { Client } = req("pg");

const c = new Client({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
await c.connect();
const nav = await c.query("SELECT nav_json FROM school_settings WHERE id = 'default'");
const j = nav.rows[0].nav_json || {};
if (!j.counter) {
  j.counter = ["Today", "Visitors", "Inquiries", "Directory", "Calendar"];
  await c.query("UPDATE school_settings SET nav_json = $1::jsonb WHERE id = 'default'", [JSON.stringify(j)]);
  console.log("counter nav added to demo");
} else {
  console.log("counter nav already present");
}
const chk = await c.query("SELECT module_key, role FROM perm_matrix WHERE landing = true AND role IN ('counter','driver')");
console.log("landings:", JSON.stringify(chk.rows));
await c.end();
