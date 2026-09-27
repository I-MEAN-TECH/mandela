import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const f = await p.query(`SELECT key, enabled FROM feature_flag WHERE key='library'`);
const a = await p.query(`SELECT action, entity, entity_id FROM audit_log ORDER BY id DESC LIMIT 1`);
console.log("flag:", f.rows[0], "| audit:", a.rows[0]);
await p.end();
