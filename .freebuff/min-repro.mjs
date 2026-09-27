// Minimal withSession repro: same pool config + transaction dance as pool.ts,
// 50-concurrent waves. If this wedges, bisect the trigger without the app.
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/backend/apps/api/package.json");
const { Pool } = require("pg");

const VARIANT = process.env.VARIANT || "full";
const POOL = {
  host: "127.0.0.1", port: 54329, user: "mandela", password: "mandela_dev_pw",
  database: "mandela_demo", max: 5,
  options: "-c idle_in_transaction_session_timeout=60000 -c statement_timeout=120000",
};

const pool = new Pool(POOL);

async function withSession(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
    await client.query("SELECT set_config('app.role', $1, true)", ["admin"]);
    await client.query("SET LOCAL ROLE mandela_app");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const work = {
  full: (c) => c.query("SELECT count(*)::int FROM learner"),
  norole: (c) => c.query("SELECT 1"),
  empty: (c) => c.query("SELECT 1"),
};

let done = 0, errors = 0;
async function one() {
  try {
    await withSession((c) => work[VARIANT](c));
    done++;
  } catch (e) {
    errors++;
    if (errors <= 3) console.log("  err:", e.message.slice(0, 90));
  }
}

for (const wave of [5, 20, 50]) {
  const t0 = Date.now();
  await Promise.all(Array.from({ length: wave }, () => one()));
  console.log(`VARIANT=${VARIANT} wave ${wave}: done=${done} err=${errors} in ${Date.now() - t0}ms`);
  if (done + errors >= 75) break;
}

// recovery probe
const t1 = Date.now();
await pool.query("SELECT 1");
console.log(`recovery probe ok in ${Date.now() - t1}ms`);
await pool.end();
process.exit(0);
