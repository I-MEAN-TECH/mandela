import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const s = await p.query(`SELECT id::text, name, kind::text AS kind, head_staff_id::text AS head FROM section WHERE name = 'Science Lab'`);
console.log("section:", s.rows[0]);
const d = await p.query(`SELECT duty_key, label FROM staff_duty WHERE duty_key = 'patron-of:' || $1`, [s.rows[0]!.id]);
console.log("duty:", d.rows);
const a = await p.query(`SELECT action, entity FROM audit_log WHERE entity = 'section' ORDER BY id DESC LIMIT 3`);
console.log("audit:", a.rows);
await p.end();
