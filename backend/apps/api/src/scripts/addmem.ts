import { Pool } from "pg";
const p = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });
const sec = await p.query(`SELECT id::text FROM section WHERE name = 'Science Lab'`);
const l = await p.query(`SELECT id::text, first_name || ' ' || last_name AS name FROM learner ORDER BY admission_no LIMIT 1`);
await p.query(`INSERT INTO section_member (section_id, learner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [sec.rows[0]!.id, l.rows[0]!.id]);
console.log("added", l.rows[0]!.name, "to", sec.rows[0]!.id);
await p.end();
