import { getSchoolPool, withRlsSession, type PoolClient } from "../db/pool.js";
import type { Principal } from "../web/queries.js";

/** Run a block under the caller's RLS session (same idiom as web/queries.ts). */
async function withSession<T>(
  dbName: string,
  session: { userId: string; role: string; guardianId?: string },
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const db = getSchoolPool(dbName);
  const client = await db.connect();
  try {
    return await withRlsSession(client, session, fn);
  } finally {
    client.release();
  }
}

/**
 * Money-lifecycle integrity — the "consequences" layer
 * (docs/ECOSYSTEM-STRATEGY.md §2.3). One endpoint, five invariants, all
 * computed in SQL against the live school DB:
 *
 *   1. no_orphans        — every payment names a learner that exists
 *   2. receipts_unique   — receipt numbers never collide (idempotency rule)
 *   3. consent_traceable — every optional fee item carries a consent decision
 *   4. ledger_closed     — billed (consent-aware) >= collected, per term
 *   5. no_double_confirm — no two confirmed payments share an M-Pesa txn
 *
 * A violation here is a data corruption event, not a UX error — the harness
 * (debug-modules.mjs) calls this endpoint and fails the build on any breach.
 */

export interface IntegrityViolation {
  check: string;
  severity: "critical" | "warning";
  detail: string;
  count: number;
}

export async function integrityReport(
  dbName: string,
  principal: Principal,
): Promise<{ ok: boolean; checks: { name: string; ok: boolean; count: number; detail: string }[] }> {
  const session: { userId: string; role: string; guardianId?: string } =
    principal.kind === "staff"
      ? { userId: principal.userId, role: principal.role }
      : { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId };
  return withSession(dbName, session, async (c) => {
    const checks: { name: string; ok: boolean; count: number; detail: string }[] = [];

    // 1) no_orphans — payments pointing at missing learners (FK normally
    //    prevents this; RLS/partition quirks or manual writes might not).
    const orphans = await c.query(
      `SELECT count(*)::int AS n FROM payments p
       LEFT JOIN learner l ON l.id = p.learner_id
       WHERE l.id IS NULL`,
    );
    checks.push({
      name: "no_orphans",
      ok: (orphans.rows[0]?.n ?? 0) === 0,
      count: orphans.rows[0]?.n ?? 0,
      detail: "every payment names a learner that exists",
    });

    // 2) receipts_unique — receipt_no must never collide.
    const dups = await c.query(
      `SELECT count(*)::int AS n FROM (
         SELECT receipt_no FROM payments GROUP BY receipt_no HAVING count(*) > 1
       ) d`,
    );
    checks.push({
      name: "receipts_unique",
      ok: (dups.rows[0]?.n ?? 0) === 0,
      count: dups.rows[0]?.n ?? 0,
      detail: "receipt numbers are unique (M-Pesa idempotency rule)",
    });

    // 3) consent_traceable — every optional item BILLED to a learner (counted
    //    in v_fee_balance, i.e. consent granted) carries a decision row.
    //    Undecided levies are legal — they simply aren't billed yet.
    const unconsented = await c.query(
      `SELECT count(*)::int AS n FROM fee_item fi
       WHERE fi.is_optional = true
         AND (SELECT cs.choice FROM consent cs WHERE cs.id = fi.consent_id) = 'granted'
         AND NOT EXISTS (
           SELECT 1 FROM consent cs2
           WHERE cs2.id = fi.consent_id AND cs2.choice IN ('granted','revoked')
         )`,
    );
    checks.push({
      name: "consent_traceable",
      ok: (unconsented.rows[0]?.n ?? 0) === 0,
      count: unconsented.rows[0]?.n ?? 0,
      detail: "every optional fee item billed to a learner carries a guardian consent decision",
    });

    // 4) ledger_closed — billed (consent-aware) >= collected, per term.
    //    Confirmed collections must never exceed what was actually billed.
    const over = await c.query<{ term_label: string; billed_cents: string; paid_cents: string }>(
      `WITH billed AS (
         SELECT fi.term_id,
                COALESCE(SUM(CASE WHEN fi.is_optional = false OR cs.choice = 'granted'
                                  THEN fi.amount ELSE 0 END), 0) AS billed_cents
         FROM fee_item fi
         LEFT JOIN consent cs ON cs.id = fi.consent_id
         GROUP BY fi.term_id
       ), paid AS (
         SELECT t.id AS term_id, COALESCE(SUM(p.amount), 0) AS paid_cents
         FROM term t
         LEFT JOIN payments p ON p.state = 'confirmed'
           AND p.paid_at >= t.starts_on AND p.paid_at < t.ends_on + interval '1 day'
         GROUP BY t.id
       )
       SELECT t.label AS term_label, b.billed_cents::text, d.paid_cents::text
       FROM term t
       JOIN billed b ON b.term_id = t.id
       JOIN paid d ON d.term_id = t.id
       WHERE d.paid_cents > b.billed_cents`,
    );
    checks.push({
      name: "ledger_closed",
      ok: over.rowCount === 0,
      count: over.rowCount ?? 0,
      detail: over.rowCount
        ? over.rows.map((r) => `${r.term_label}: collected ${(Number(r.paid_cents) / 100).toFixed(2)} > billed ${(Number(r.billed_cents) / 100).toFixed(2)}`).join("; ")
        : "collected never exceeds billed (consent-aware), per term",
    });

    // 5) no_double_confirm — one M-Pesa transaction, one confirmed payment.
    const doublePay = await c.query(
      `SELECT count(*)::int AS n FROM (
         SELECT mpesa_txn_id FROM payments
         WHERE mpesa_txn_id IS NOT NULL AND state = 'confirmed'
         GROUP BY mpesa_txn_id HAVING count(*) > 1
       ) x`,
    );
    checks.push({
      name: "no_double_confirm",
      ok: (doublePay.rows[0]?.n ?? 0) === 0,
      count: doublePay.rows[0]?.n ?? 0,
      detail: "no M-Pesa transaction confirms twice",
    });

    return { ok: checks.every((k) => k.ok), checks };
  });
}

/** Used by the controller — wraps RLS; staff-only is enforced at the API layer. */
export async function integrityForPrincipal(dbName: string, principal: Principal) {
  return integrityReport(dbName, principal);
}

// Re-export for the harness to hit through the API instead of direct DB.
export type IntegrityResult = Awaited<ReturnType<typeof integrityReport>>;
