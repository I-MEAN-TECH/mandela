import { Pool, type PoolClient } from "pg";
export type { PoolClient };
import { effectivePg, useEmbeddedPostgres, POOL_MAX } from "../config.js";

/**
 * Control-plane pool — connects to mandela_control.
 * In dev this waits for the embedded Postgres to accept connections.
 */
let controlPool: Pool | null = null;

/**
 * Fresh-school encoding is fixed at creation in the provisioner
 * (CREATE DATABASE ... ENCODING 'UTF8') — that is the real fix for the
 * WIN1252 conversion failures on non-ASCII migration text. The client
 * already negotiates UTF8 on its own.
 *
 * Perf-gate finding (2026-09-27): a client that abandons a request mid-flight
 * (browser tab close, load-test abort, crashed worker) can leave a backend
 * stuck `idle in transaction` forever — the transaction holds a pool slot the
 * server never gets back, and enough of them wedge EVERY route. Postgres
 * itself is the right place to enforce the deadline: any transaction idle
 * longer than 60s is rolled back and its slot released. Statement timeout
 * guards runaway queries the same way (RLS reads are LIMIT-capped; none of
 * the product queries legitimately run minutes).
 */
const PG_CLIENT_CONFIG = {
  options: "-c idle_in_transaction_session_timeout=60000 -c statement_timeout=120000",
} as const;

export async function getControlPool(): Promise<Pool> {
  if (controlPool) return controlPool;
  controlPool = new Pool({
    host: effectivePg.host,
    port: effectivePg.port,
    user: effectivePg.user,
    password: effectivePg.password,
    database: effectivePg.controlDb,
    max: POOL_MAX.control,
    ...PG_CLIENT_CONFIG,
  });
  controlPool.on("error", (err) => console.error("[pg control]", err.message));
  controlPool.on("connect", (client) => {
    client.on("error", (err) => console.error("[pg control client]", err.message));
  });
  await waitForPostgres(controlPool);
  return controlPool;
}

/** Server-wide map of per-school pools (pool per DB, kept warm). */
const schoolPools = new Map<string, Pool>();

export function getSchoolPool(dbName: string): Pool {
  const existing = schoolPools.get(dbName);
  if (existing) return existing;
  const pool = new Pool({
    host: effectivePg.host,
    port: effectivePg.port,
    user: effectivePg.user,
    password: effectivePg.password,
    database: dbName,
    max: POOL_MAX.school,
    ...PG_CLIENT_CONFIG,
  });
  pool.on("error", (err) => console.error(`[pg ${dbName}]`, err.message));
  // A timeout-terminated backend surfaces as 'error' on the IDLE Client
  // object, not the pool — an unhandled one crashes the process (Node throws
  // on EventEmitter 'error' with no listener). Attach per-client listeners
  // as clients are handed out so a terminated backend can never take the
  // API down with it.
  pool.on("connect", (client) => {
    client.on("error", (err) => console.error(`[pg ${dbName} client]`, err.message));
    // Query-level forensics (wedge hunt 2026-09-27): log every query start
    // and completion per client so a never-settling statement is visible.
    if (process.env.PG_TRACE !== "1") return;
    type QueryFn = (...args: unknown[]) => Promise<unknown>;
    const orig = client.query.bind(client) as unknown as QueryFn;
    let n = 0;
    (client as unknown as { query: QueryFn }).query = (...args: unknown[]) => {
      const first = args[0] as { text?: string } | string;
      const sql = String(typeof first === "string" ? first : (first as { text?: string })?.text ?? "").replace(/\s+/g, " ").slice(0, 70);
      const id = `${dbName}#${++n}`;
      const t0 = Date.now();
      console.log(`[q+] ${id} ${sql}`);
      const r = orig(...args);
      Promise.resolve(r).then(
        () => console.log(`[q-] ${id} ${Date.now() - t0}ms`),
        (e: Error) => console.log(`[q!] ${id} ${Date.now() - t0}ms ${e.message.slice(0, 60)}`),
      );
      return r;
    };
  });
  schoolPools.set(dbName, pool);
  return pool;
}

export async function closeAllPools(): Promise<void> {
  const pools = [...schoolPools.values()];
  if (controlPool) pools.push(controlPool);
  await Promise.allSettled(pools.map((p) => p.end()));
  schoolPools.clear();
  controlPool = null;
}

/** Live pool gauges for the loop watchdog (wedge forensics, 2026-09-27). */
export function poolStats(): Record<string, { total: number; idle: number; waiting: number }> {
  const out: Record<string, { total: number; idle: number; waiting: number }> = {};
  if (controlPool)
    out.control = { total: controlPool.totalCount, idle: controlPool.idleCount, waiting: controlPool.waitingCount };
  for (const [name, p] of schoolPools)
    out[name] = { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };
  return out;
}

/** Stage counters for withSession (where does the first acquire stall?). */
export const sessionStages = { acquired: 0, entered: 0, finished: 0, released: 0, awaitingConnect: 0 };
export function sessionStageSnapshot() {
  return { ...sessionStages, awaitingConnect: sessionStages.acquired - sessionStages.entered };
}

/**
 * Run a function as the RLS-scoped application role with the session GUCs
 * set (defense-in-depth layers 2+3).
 *
 * SET LOCAL ROLE mandela_app is what makes Row Level Security actually apply
 * to the live product: connecting directly as the cluster owner would bypass
 * every policy (superusers ignore RLS). The role is NOLOGIN and grants come
 * from the provisioner; policies come from migrations 002 + 007.
 *
 * SET LOCAL is transaction-scoped: safe, and reset on rollback.
 */
export async function withRlsSession<T>(
  client: PoolClient,
  session: { userId: string; role: string; guardianId?: string },
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.user_id', $1, true)", [session.userId]);
    await client.query("SELECT set_config('app.role', $1, true)", [session.role]);
    if (session.guardianId) {
      await client.query("SELECT set_config('app.guardian_id', $1, true)", [session.guardianId]);
    }
    // The whole point: drop owner privileges for this transaction so every
    // statement below runs under the school's RLS policies.
    await client.query("SET LOCAL ROLE mandela_app");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    // ROLLBACK is best-effort: when the backend itself is gone (idle-in-
    // transaction timeout FATAL, restart, network drop) the rollback ALSO
    // fails, and the 'error' event on a pg Client is fatal to the process
    // if nothing listens. Pool-level handlers log it; releasing the client
    // (withSession's finally) recycles the dead socket.
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

async function waitForPostgres(pool: Pool, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, useEmbeddedPostgres ? 500 : 1000));
    }
  }
  throw new Error(`Postgres not reachable at ${effectivePg.host}:${effectivePg.port}`);
}
