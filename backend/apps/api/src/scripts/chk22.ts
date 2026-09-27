import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const m = await p.query(`SELECT name FROM _mandela_migrations ORDER BY applied_at DESC LIMIT 2`);
console.log("migrations:", m.rows.map(r => r.name).join(", "));
const t = await p.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('rails_match','bank_csv_import','report_card','perm_matrix','staff_duty','integration_health')`);
console.log("tables:", t.rows.map(r => r.table_name).join(", "));
const pm = await p.query(`SELECT count(*)::int AS c FROM perm_matrix`);
console.log("perm rows:", pm.rows[0].c);
await p.end();
