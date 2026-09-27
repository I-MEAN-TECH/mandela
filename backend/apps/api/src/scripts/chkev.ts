import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const e = await p.query(`SELECT title, kind::text AS kind, starts_on::text, notes FROM school_event`);
console.table(e.rows);
const a = await p.query(`SELECT action FROM audit_log WHERE action = 'event.create' ORDER BY id DESC LIMIT 1`);
console.log("audit:", a.rows);
await p.end();
