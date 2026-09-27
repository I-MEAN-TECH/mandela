import { getControlPool, getSchoolPool } from "../db/pool.js";
import * as rolePulse from "./rolePulse.js";
import type { Principal } from "./queries.js";

/**
 * role_pulse rollup worker (System completion D4, PLATFORM-PLAN §9). Same
 * shape as the talk worker: one loop, every active school, boring semantics.
 *
 * Every 60s per school: recompute the eight school-wide role pulses and upsert
 * them into `role_pulse` (047). The API's pulse GETs serve the rollup while it
 * is fresh (<90s) and compute live when stale — a broken rollup degrades to
 * the pre-rollup behavior, never to an empty dashboard.
 *
 * Teacher/HOD are deliberately NOT rolled up: their reads are class-scoped
 * through per-session GUCs (att_staff/asmt_staff RLS), which a shared row
 * cannot represent.
 */

type StaffPrincipal = Extract<Principal, { kind: "staff" }>;

const REFRESH_MS = 60_000;
const FRESH_MS = 90_000;

/** role → its pulse fn. The principal.role passed in is that role. */
const COMPUTERS: Record<string, (dbName: string, p: StaffPrincipal) => Promise<unknown>> = {
  bursar: (db, p) => rolePulse.bursarPulse(db, p),
  principal: (db, p) => rolePulse.principalPulse(db, p),
  counter: (db, p) => rolePulse.counterPulse(db, p),
  driver: (db, p) => rolePulse.driverPulse(db, p),
  dorm_parent: (db, p) => rolePulse.dormParentPulse(db, p),
  janitor: (db, p) => rolePulse.janitorPulse(db, p),
  librarian: (db, p) => rolePulse.librarianPulse(db, p),
  patron: (db, p) => rolePulse.patronPulse(db, p),
};

export const ROLLUP_ROLES = Object.keys(COMPUTERS);

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startRollupWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), REFRESH_MS);
}

export function stopRollupWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const control = await getControlPool();
    const schools = await control.query<{ db_name: string; slug: string }>(
      `SELECT db_name, slug FROM school WHERE state = 'active'`,
    );
    for (const s of schools.rows) {
      try {
        await refreshSchool(s.db_name);
      } catch (err) {
        console.error(`[rollup:${s.slug}]`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[rollup] tick skipped:", (err as Error).message);
  } finally {
    running = false;
  }
}

async function refreshSchool(dbName: string): Promise<void> {
  const db = getSchoolPool(dbName);
  // One synthetic staff principal per role — the pulse fns open their own RLS
  // session; the rollup only chooses whose eyes to compute through. Reads see
  // what that role sees; writes here run on the owner connection (no GUCs),
  // same as the talk fanout.
  for (const [role, compute] of Object.entries(COMPUTERS)) {
    try {
      // The role's rows must exist to compute through; if the school has no
      // such staff member yet, skip — there is nothing that role would see.
      const staff = await db.query<{ id: string }>(
        `SELECT id::text FROM staff WHERE role = $1::user_role AND active LIMIT 1`,
        [role],
      );
      if (!staff.rowCount) continue;
      const principal = { kind: "staff" as const, userId: staff.rows[0]!.id, role };
      const payload = await compute(dbName, principal);
      await db.query(
        `INSERT INTO role_pulse (role, payload, refreshed_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (role) DO UPDATE SET payload = $2::jsonb, refreshed_at = now()`,
        [role, JSON.stringify(payload)],
      );
    } catch (err) {
      // One role failing must not block the others.
      console.error(`[rollup:${dbName}:${role}]`, (err as Error).message);
    }
  }
}

/** Fresh rollup for a role, or null when absent/stale (>90s) — caller computes live. */
export async function freshRollup(dbName: string, role: string): Promise<unknown | null> {
  try {
    const db = getSchoolPool(dbName);
    const r = await db.query<{ payload: unknown; refreshed_at: Date }>(
      `SELECT payload, refreshed_at FROM role_pulse WHERE role = $1 LIMIT 1`,
      [role],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (Date.now() - new Date(row.refreshed_at).getTime() > FRESH_MS) return null;
    return row.payload;
  } catch {
    return null;
  }
}
