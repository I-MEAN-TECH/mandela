import crypto from "node:crypto";
import { getSchoolPool, withRlsSession, type PoolClient } from "../db/pool.js";
import type { Principal } from "../web/queries.js";
import { recordSecret } from "../talk/channels.js";

/**
 * Run a block under the caller's RLS session (same idiom as web/queries.ts).
 */
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
 * Portable records — docs/RECORD-FORMAT.md made code.
 * Signed JSON envelopes parents own and anyone can verify offline:
 *   HMAC-SHA256 over a canonical (key-sorted, whitespace-free) serialization,
 *   chained to the learner's previous export via prev_hash.
 *
 * Every export appends a row to record_export — the export *is* the audit
 * trail. RLS scopes reads/writes to the learner's own guardians and staff.
 */

// ---------------------------------------------------------------------------
// Canonical serialization: keys sorted lexicographically, recursively, no
// whitespace. Integers stay integers (money is integer cents — house rule).
// ---------------------------------------------------------------------------

export function canonical(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

function sha256(s: string): string {
  return `sha256:${crypto.createHash("sha256").update(s).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Assembly (inside the caller's RLS session)
// ---------------------------------------------------------------------------

export interface RecordRequest {
  learnerId: string;
  kind: "fee_statement" | "report_card" | "attendance_summary";
  termId?: number | null;
}

export async function buildRecord(
  dbName: string,
  principal: Principal,
  req: RecordRequest,
): Promise<{ ok: true; record: Record<string, unknown> } | { ok: false; error: string }> {
  const session =
    principal.kind === "staff"
      ? { userId: principal.userId, role: principal.role }
      : { userId: principal.guardianId, role: "guardian", guardianId: principal.guardianId };

  return withSession(dbName, session, async (c) => {
    // The learner row itself is RLS-scoped: a guardian asking for someone
    // else's child gets zero rows here.
    const learner = await c.query<{
      id: string; admission_no: string; first_name: string; last_name: string; class_name: string | null; class_id: number | null;
    }>(
      `SELECT l.id::text, l.admission_no, l.first_name, l.last_name, cl.name AS class_name, cl.id AS class_id
       FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.id = $1 AND l.status = 'active'`,
      [req.learnerId],
    );
    if (!learner.rowCount) return { ok: false as const, error: "learner not found (or not yours to read)" };
    const L = learner.rows[0]!;

    // Term: requested → current → latest.
    let termId = req.termId ?? null;
    if (!termId) {
      const t = await c.query<{ id: number }>(
        `SELECT id FROM term WHERE current_date BETWEEN starts_on AND ends_on
         ORDER BY starts_on DESC LIMIT 1`,
      );
      termId = t.rows[0]?.id ?? null;
    }
    if (!termId) {
      const t = await c.query<{ id: number }>(`SELECT id FROM term ORDER BY starts_on DESC LIMIT 1`);
      termId = t.rows[0]?.id ?? null;
    }
    if (!termId) return { ok: false as const, error: "no term exists yet — nothing to certify" };
    const term = await c.query<{ id: number; label: string; year: number; starts_on: string; ends_on: string }>(
      `SELECT t.id, t.label, ay.year, t.starts_on::text, t.ends_on::text
       FROM term t JOIN academic_year ay ON ay.id = t.year_id WHERE t.id = $1`,
      [termId],
    );
    if (!term.rowCount) return { ok: false as const, error: "term not found" };
    const T = term.rows[0]!;

    const school = await c.query<{ name: string }>(`SELECT name FROM school_settings WHERE id = 'default'`);

    const body =
      req.kind === "fee_statement"
        ? await feeStatementBody(c, req.learnerId, termId)
        : req.kind === "report_card"
          ? await reportCardBody(c, req.learnerId, termId)
          : await attendanceSummaryBody(c, req.learnerId, termId, T.starts_on, T.ends_on);

    // Chain: hash of this learner's most recent export becomes prev_hash.
    const prev = await c.query<{ payload_hash: string; signature: string }>(
      `SELECT payload_hash, signature FROM record_export
       WHERE learner_id = $1 ORDER BY issued_at DESC, id DESC LIMIT 1`,
      [req.learnerId],
    );
    const prevHash = prev.rows[0]
      ? sha256(prev.rows[0]!.payload_hash + prev.rows[0]!.signature)
      : "sha256:genesis";

    // Guardian phone hash (issued-to proof) — only when a guardian asks.
    let issuedTo: string | null = null;
    if (principal.kind === "guardian") {
      const ph = await c.query<{ phone: string }>(`SELECT phone FROM guardian WHERE id = $1`, [
        principal.guardianId,
      ]);
      if (ph.rowCount) issuedTo = sha256(ph.rows[0]!.phone);
    }

    const issuedAt = new Date().toISOString();
    const envelope: Record<string, unknown> = {
      format: "mandela.record.v1",
      school: { name: school.rows[0]?.name ?? "School" },
      learner: {
        admission_no: L.admission_no,
        first_name: L.first_name,
        class: L.class_name,
      },
      guardian_phone_hash: issuedTo,
      kind: req.kind,
      term: { year: T.year, name: T.label },
      issued_at: issuedAt,
      human: humanSummary(req.kind, body),
      body,
      prev_hash: prevHash,
    };
    const sig = crypto
      .createHmac("sha256", await recordSecret(dbName))
      .update(canonical(envelope))
      .digest("hex");
    envelope.signature = { alg: "HMAC-SHA256", v: sig };

    // Append to the chain (the export is the audit trail).
    await c.query(
      `INSERT INTO record_export (learner_id, guardian_id, kind, term_id, payload_hash, prev_hash, signature, issued_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.learnerId,
        principal.kind === "guardian" ? principal.guardianId : null,
        req.kind,
        termId,
        sha256(canonical(body)),
        prevHash,
        sig,
        issuedTo,
      ],
    );

    return { ok: true as const, record: envelope };
  });
}

function humanSummary(kind: string, body: Record<string, unknown>): Record<string, string> {
  const sh = (c: number) => `Ksh ${(c / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
  if (kind === "fee_statement") {
    const b = body as { totals: { billed_cents: number; paid_cents: number; balance_cents: number } };
    return {
      balance: sh(b.totals.balance_cents),
      note: `Billed ${sh(b.totals.billed_cents)}, paid ${sh(b.totals.paid_cents)}. All figures in Kenyan shillings.`,
    };
  }
  if (kind === "attendance_summary") {
    const b = body as { counts: { present: number; late: number; absent: number; excused: number } };
    return {
      attendance: `${b.counts.present} present, ${b.counts.late} late, ${b.counts.absent} absent, ${b.counts.excused} excused`,
      note: "Marks recorded by teachers during the term.",
    };
  }
  return { note: "Learner performance per learning area, as recorded by teachers." };
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

async function feeStatementBody(c: PoolClient, learnerId: string, termId: number) {
  const items = await c.query<{ name: string; amount: string; is_optional: boolean; consented: boolean | null }>(
    `SELECT fi.name, fi.amount::text, fi.is_optional,
            CASE WHEN fi.consent_id IS NULL THEN NULL
                 ELSE (SELECT choice = 'granted' FROM consent cs WHERE cs.id = fi.consent_id) END AS consented
     FROM fee_item fi
     WHERE fi.learner_id = $1 AND fi.term_id = $2
     ORDER BY fi.created_at`,
    [learnerId, termId],
  );
  const payments = await c.query<{ receipt_no: string; amount: string; method: string; paid_at: string; state: string }>(
    `SELECT receipt_no, amount::text, method::text, paid_at::text, state::text
     FROM payments WHERE learner_id = $1
       AND paid_at >= (SELECT starts_on FROM term WHERE id = $2)
       AND paid_at <  (SELECT ends_on FROM term WHERE id = $2) + interval '1 day'
     ORDER BY paid_at`,
    [learnerId, termId],
  );
  const billed = items.rows.reduce(
    (sum, i) => sum + (i.is_optional === false || i.consented === true ? Number(i.amount) : 0),
    0,
  );
  const paid = payments.rows
    .filter((p) => p.state === "confirmed")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    items: items.rows.map((i) => ({
      title: i.name,
      amount_cents: Number(i.amount),
      optional: i.is_optional,
      consented: i.consented,
    })),
    payments: payments.rows.map((p) => ({
      receipt_no: p.receipt_no,
      amount_cents: Number(p.amount),
      method: p.method,
      paid_at: p.paid_at,
      state: p.state,
    })),
    totals: { billed_cents: billed, paid_cents: paid, balance_cents: billed - paid },
  };
}

async function reportCardBody(c: PoolClient, learnerId: string, termId: number) {
  const rows = await c.query<{ subject: string; strand: string | null; sub_strand: string | null; exam_type: string; score: string | null; grade: string | null }>(
    `SELECT subject, strand, sub_strand, exam_type::text, score::text, grade::text
     FROM assessment
     WHERE learner_id = $1 AND term_id = $2 AND published = true
     ORDER BY subject, strand NULLS FIRST, created_at`,
    [learnerId, termId],
  );
  const att = await attendanceCounts(c, learnerId, termId);
  return {
    areas: rows.rows.map((r) => ({
      area: r.subject,
      strand: r.strand,
      sub_strand: r.sub_strand,
      exam_type: r.exam_type,
      score: r.score != null ? Number(r.score) : null,
      grade: r.grade,
    })),
    attendance: att,
  };
}

async function attendanceSummaryBody(
  c: PoolClient,
  learnerId: string,
  termId: number,
  startsOn: string,
  endsOn: string,
) {
  const marks = await c.query<{ day: string; mark: string }>(
    `SELECT day::text, mark::text FROM attendance
     WHERE learner_id = $1 AND day BETWEEN $2 AND $3
     ORDER BY day`,
    [learnerId, startsOn, endsOn],
  );
  return { days: marks.rows, counts: attendanceCountsSync(marks.rows) };
}

function attendanceCountsSync(rows: { mark: string }[]) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of rows) {
    const k = r.mark as keyof typeof counts;
    if (k in counts) counts[k]!++;
  }
  return counts;
}

async function attendanceCounts(c: PoolClient, learnerId: string, termId: number) {
  const r = await c.query<{ mark: string; n: string }>(
    `SELECT mark::text, count(*)::text AS n FROM attendance
     WHERE learner_id = $1
       AND day BETWEEN (SELECT starts_on FROM term WHERE id = $2)
                    AND (SELECT ends_on FROM term WHERE id = $2)
     GROUP BY mark`,
    [learnerId, termId],
  );
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const row of r.rows) {
    const k = row.mark as keyof typeof counts;
    if (k in counts) counts[k] = Number(row.n);
  }
  return counts;
}
