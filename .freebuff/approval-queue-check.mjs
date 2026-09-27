import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");
const { Pool } = require("pg");
const pool = new Pool({ host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw", database: "mandela_demo" });

const q = await pool.query(`
  SELECT a.id::text, a.request_type, a.state, a.created_at, s.full_name AS raiser, s.role
  FROM approval_request a JOIN staff s ON s.id = a.requester_id
  WHERE a.state = 'pending'
  ORDER BY a.created_at ASC`);
console.log("pending approvals (oldest first):");
for (const r of q.rows) console.log(` ${r.created_at.toISOString()}  ${r.request_type}  by ${r.raiser} (${r.role})  ${r.id}`);

// scratch cleanup: the three admin(Njeri)-raised pending rows from earlier gate runs
const del = await pool.query(`
  DELETE FROM approval_request a
  USING staff s
  WHERE s.id = a.requester_id AND a.state = 'pending' AND s.role = 'admin' AND s.full_name = 'Njeri Kamau'
  RETURNING a.id::text`);
console.log("deleted admin-raised scratch approvals:", del.rows.map(r => r.id));
await pool.end();
