import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
// Direct proof at the DB level: as admin role, count-only is the intended surface.
const stats = await p.query(`SELECT * FROM counselling_stats()`);
console.log("stats fn (all roles may call):", stats.rows[0]);
const g = await p.query(`SELECT has_table_privilege(current_user, 'counselling_case', 'SELECT') AS via_root`);
console.log("root bypass (expected true, RLS applies to app roles):", g.rows[0]);
await p.end();
