import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const r = await p.query(`SELECT kind::text, category, points, description, (parent_notified_at IS NOT NULL) AS notified FROM discipline_incident`);
console.table(r.rows);
const a = await p.query(`SELECT action FROM audit_log WHERE action = 'discipline.record' ORDER BY id DESC LIMIT 1`);
console.log("audit:", a.rows);
await p.end();
