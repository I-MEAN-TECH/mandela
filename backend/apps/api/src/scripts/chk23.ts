import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const m = await p.query(`SELECT name FROM _mandela_migrations ORDER BY applied_at DESC LIMIT 3`);
console.log("migrations:", m.rows.map((r: { name: string }) => r.name));
const t = await p.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('section','section_member','discipline_incident','counselling_case','school_event') ORDER BY 1`);
console.log("tables:", t.rows.map((r: { table_name: string }) => r.table_name));
const f = await p.query(`SELECT routine_name FROM information_schema.routines WHERE routine_name = 'counselling_stats'`);
console.log("fn:", f.rows.map((r: { routine_name: string }) => r.routine_name));
await p.end();
