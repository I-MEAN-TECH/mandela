import PDFDocument from "pdfkit";
import type { Response } from "express";
import { getSchoolPool } from "../db/pool.js";
import type { Principal } from "./queries.js";

/**
 * Server-side PDF (System completion C13, PLATFORM-PLAN §7 #5) — report cards
 * and fee statements render the same ink-and-paper discipline the print CSS
 * shows, but as real PDF bytes: the office can email/archive them, and they
 * print identically everywhere. Session-gated at the controller; the data
 * reads run through RLS exactly like the screen.
 *
 * Layout law: one ink, tabular numerals, no decoration. A4, 32pt margins.
 */

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const LINE = "#d8d8d8";

function streamPdf(res: Response, doc: PDFKit.PDFDocument, filename: string): void {
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
}

function header(doc: PDFKit.PDFDocument, school: string, title: string, sub: string): void {
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(school, { continued: false });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(sub);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(title);
  doc.moveDown(0.4);
  const y = doc.y;
  doc.moveTo(32, y).lineTo(doc.page.width - 32, y).lineWidth(1).strokeColor(LINE).stroke();
  doc.moveDown(0.6);
}

export async function reportCardPdf(
  dbName: string,
  principal: Principal,
  learnerId: string,
  termId: number | null,
  res: Response,
): Promise<void> {
  const db = getSchoolPool(dbName);
  const learner = await db.query<{ name: string; class_name: string | null; class_code: string | null }>(
    `SELECT l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS name,
            cl.name AS class_name, cl.code AS class_code
     FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
     WHERE l.id = $1`,
    [learnerId],
  );
  if (!learner.rowCount) {
    res.status(404).json({ error: "learner not found" });
    return;
  }
  const termFilter = termId ? termId : `(SELECT id FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)`;
  const schoolRow = await db.query<{ name: string; motto: string | null }>(
    `SELECT name, motto FROM school_settings WHERE id = 'default'`,
  );
  const rows = await db.query<{ subject: string; exam_type: string; score: string | null; grade: string | null }>(
    `SELECT a.subject, a.exam_type::text AS exam_type, a.score::text AS score, a.grade::text AS grade
     FROM assessment a
     WHERE a.learner_id = $1 AND a.term_id = ${termFilter}
     ORDER BY a.subject, a.exam_type`,
    [learnerId],
  );
  const means = await db.query<{ subject: string; mean: string }>(
    `SELECT subject, ROUND(AVG(score)::numeric, 1)::text AS mean
     FROM assessment WHERE term_id = ${termFilter} AND score IS NOT NULL
     GROUP BY subject`,
  );
  const meanBy = new Map(means.rows.map((m) => [m.subject, m.mean]));

  const doc = new PDFDocument({ size: "A4", margin: 32, info: { Title: `Report card — ${learner.rows[0]!.name}` } });
  streamPdf(res, doc, `report-card-${learnerId}.pdf`);
  header(
    doc,
    schoolRow.rows[0]?.name ?? "School",
    `Report card — ${learner.rows[0]!.name}`,
    [learner.rows[0]!.class_name, learner.rows[0]!.class_code].filter(Boolean).join(" · ") || "—",
  );

  // Group by subject; columns: exam types as rows under each subject.
  const bySubject = new Map<string, { exam_type: string; score: string | null; grade: string | null }[]>();
  for (const r of rows.rows) {
    const list = bySubject.get(r.subject) ?? [];
    list.push({ exam_type: r.exam_type, score: r.score, grade: r.grade });
    bySubject.set(r.subject, list);
  }

  const tableX = 32;
  const colW = [190, 110, 70, 70, 60];
  for (const [subject, entries] of bySubject) {
    if (doc.y > doc.page.height - 140) { doc.addPage(); }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(subject, tableX, doc.y);
    doc.moveDown(0.3);
    let y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text("Assessment", tableX, y)
      .text("Score", tableX + colW[0]!, y)
      .text("Grade", tableX + colW[0]! + colW[1]!, y)
      .text("Class mean", tableX + colW[0]! + colW[1]! + colW[2]!, y);
    y += 14;
    doc.moveTo(tableX, y).lineTo(tableX + colW[0]! + colW[1]! + colW[2]! + colW[3]!, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 6;
    for (const e of entries) {
      doc.font("Helvetica").fontSize(10).fillColor(INK)
        .text(e.exam_type, tableX, y)
        .text(e.score ?? "—", tableX + colW[0]!, y)
        .text(e.grade ?? "—", tableX + colW[0]! + colW[1]!, y)
        .text(meanBy.get(subject) ?? "—", tableX + colW[0]! + colW[1]! + colW[2]!, y);
      y += 15;
    }
    doc.y = y + 8;
  }
}

export async function statementPdf(
  dbName: string,
  principal: Principal,
  learnerId: string,
  res: Response,
): Promise<void> {
  const db = getSchoolPool(dbName);
  const learner = await db.query<{ name: string; class_name: string | null }>(
    `SELECT l.first_name || ' ' || COALESCE(l.middle_name || ' ', '') || l.last_name AS name,
            cl.name AS class_name
     FROM learner l LEFT JOIN class cl ON cl.id = l.class_id
     WHERE l.id = $1`,
    [learnerId],
  );
  if (!learner.rowCount) {
    res.status(404).json({ error: "learner not found" });
    return;
  }
  const schoolRow = await db.query<{ name: string }>(`SELECT name FROM school_settings WHERE id = 'default'`);
  // Billed = effective fee items (mandatory or consented), mirroring the
  // on-screen statement (learnerTermStatement).
  const billed = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(CASE WHEN fi.is_optional = false
                               OR EXISTS (SELECT 1 FROM consent cc WHERE cc.id = fi.consent_id AND cc.choice = 'granted')
                              THEN fi.amount ELSE 0 END), 0)::text AS total
     FROM fee_item fi WHERE fi.learner_id = $1`,
    [learnerId],
  );
  const paid = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM payments WHERE learner_id = $1 AND state = 'confirmed'`,
    [learnerId],
  );
  const payments = await db.query<{ receipt_no: string; amount: string; paid_at: string; method: string }>(
    `SELECT receipt_no, amount::text AS amount, paid_at::text AS paid_at, method::text AS method
     FROM payments WHERE learner_id = $1 AND state = 'confirmed'
     ORDER BY paid_at DESC LIMIT 40`,
    [learnerId],
  );

  const doc = new PDFDocument({ size: "A4", margin: 32, info: { Title: `Statement — ${learner.rows[0]!.name}` } });
  streamPdf(res, doc, `statement-${learnerId}.pdf`);
  header(
    doc,
    schoolRow.rows[0]?.name ?? "School",
    `Fees statement — ${learner.rows[0]!.name}`,
    learner.rows[0]!.class_name ?? "—",
  );

  const billedCents = Number(billed.rows[0]?.total ?? 0);
  const paidCents = Number(paid.rows[0]?.total ?? 0);
  const kes = (cents: number) => `Ksh ${cents.toLocaleString("en-KE")}`;

  doc.font("Helvetica").fontSize(11).fillColor(INK);
  doc.text(`Billed this year: ${kes(billedCents)}`, 32, doc.y);
  doc.text(`Paid (confirmed): ${kes(paidCents)}`);
  doc.font("Helvetica-Bold").text(`Balance: ${kes(Math.max(billedCents - paidCents, 0))}`);
  doc.moveDown(0.8);
  let y = doc.y + 6;
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text("Receipt", 32, y)
    .text("Date", 182, y)
    .text("Method", 292, y)
    .text("Amount", 402, y);
  y += 14;
  doc.moveTo(32, y).lineTo(462, y).lineWidth(0.5).strokeColor(LINE).stroke();
  y += 6;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  for (const p of payments.rows) {
    if (y > doc.page.height - 60) { doc.addPage(); y = 48; }
    doc.text(p.receipt_no, 32, y)
      .text(p.paid_at.slice(0, 10), 182, y)
      .text(p.method, 292, y)
      .text(kes(Number(p.amount)), 402, y);
    y += 15;
  }
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, 32, doc.y, { continued: true })
    .font("Helvetica-Bold").fillColor(INK).text(`  ${value}`);
}

/**
 * Board pack — one A4 the governors actually read: term identity, the money
 * position, attendance, staff activation, governance load (approvals/tasks),
 * discipline tone, and proof the record is alive. Leaders-only (admin /
 * principal) at the controller; reads run in-session like every other
 * aggregate. Reuses the C13 PDF discipline.
 */
export async function boardPackPdf(
  dbName: string,
  principal: Principal,
  res: Response,
): Promise<void> {
  const db = getSchoolPool(dbName);
  const schoolRow = await db.query<{ name: string }>(`SELECT name FROM school_settings WHERE id = 'default'`);

  const stats = await db.query<Record<string, string>>(
    `WITH cur AS (
       SELECT id, label, starts_on, ends_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1
     )
     SELECT
       (SELECT label FROM cur) AS term_name,
       (SELECT to_char(starts_on, 'DD Mon YYYY') || ' - ' || to_char(ends_on, 'DD Mon YYYY') FROM cur) AS term_window,
       COALESCE((SELECT SUM(p.amount) FROM payments p
                 WHERE p.state = 'confirmed'
                   AND p.paid_at >= (SELECT starts_on FROM cur)
                   AND p.paid_at <= (SELECT ends_on FROM cur)), 0)::text AS collected,
       COALESCE((SELECT SUM(fi.amount) FILTER (WHERE fi.is_optional = false) FROM fee_item fi), 0)::text AS billed,
       (SELECT COUNT(*)::text FROM learner WHERE status = 'active') AS learners_active,
       (SELECT COUNT(*)::text FROM staff WHERE active = true) AS staff_total,
       (SELECT COUNT(*)::text FROM staff WHERE active = true AND joined = true) AS staff_started,
       (SELECT COUNT(*)::text FROM approval_request WHERE state = 'pending') AS approvals_pending,
       (SELECT COUNT(*)::text FROM admin_task WHERE state = 'open') AS tasks_open,
       (SELECT COUNT(*)::text FROM discipline_incident
         WHERE occurred_on >= CURRENT_DATE - 7) AS incidents_7d,
       (SELECT COUNT(*)::text FROM audit_log
         WHERE at >= CURRENT_DATE - 7) AS audit_7d,
       COALESCE((SELECT ROUND(100.0 * SUM(CASE WHEN mark IN ('present','late') THEN 1 ELSE 0 END)
                               / NULLIF(COUNT(*), 0), 0)::text
         FROM attendance WHERE day = CURRENT_DATE), '0') AS attendance_today`,
  );
  const s = stats.rows[0] ?? {};

  const byClass = await db.query<{ class_name: string; billed: string; collected: string }>(
    `SELECT COALESCE(cl.name, 'Unassigned') AS class_name,
            COALESCE(SUM(fi.amount) FILTER (WHERE fi.is_optional = false), 0)::text AS billed,
            COALESCE((SELECT SUM(p.amount) FROM payments p
                      JOIN learner pl ON pl.id = p.learner_id
                      WHERE p.state = 'confirmed' AND pl.class_id = cl.id
                        AND p.paid_at >= (SELECT starts_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)
                        AND p.paid_at <= (SELECT ends_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)), 0)::text AS collected
     FROM fee_item fi
     JOIN learner l ON l.id = fi.learner_id
     LEFT JOIN class cl ON cl.id = l.class_id
     GROUP BY cl.id, cl.name ORDER BY 2 DESC LIMIT 12`,
  );

  const doc = new PDFDocument({ size: "A4", margin: 32, info: { Title: "Board pack" } });
  streamPdf(res, doc, "board-pack.pdf");
  header(
    doc,
    schoolRow.rows[0]?.name ?? "School",
    "Board pack — term position",
    [s.term_name ? `Term: ${s.term_name}` : "Term: (none open)", s.term_window].filter(Boolean).join("  ·  "),
  );

  const kes = (cents: number) => `Ksh ${Math.round(cents / 100).toLocaleString("en-KE")}`;
  doc.font("Helvetica").fontSize(11).fillColor(INK);
  kv(doc, "Collected this term", kes(Number(s.collected ?? 0)));
  kv(doc, "Billed (mandatory)", kes(Number(s.billed ?? 0)));
  kv(doc, "Still to collect", kes(Math.max(Number(s.billed ?? 0) - Number(s.collected ?? 0), 0)));
  kv(doc, "Attendance today", `${s.attendance_today ?? "0"}%`);
  kv(doc, "Learners on roll", s.learners_active ?? "0");
  kv(doc, "Staff started / on books", `${s.staff_started ?? "0"} / ${s.staff_total ?? "0"}`);
  kv(doc, "Approvals pending / tasks open", `${s.approvals_pending ?? "0"} / ${s.tasks_open ?? "0"}`);
  kv(doc, "Discipline incidents (7d)", s.incidents_7d ?? "0");
  kv(doc, "Record entries (7d)", s.audit_7d ?? "0");

  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Collections by class (this term)");
  doc.moveDown(0.3);
  let y = doc.y + 4;
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED)
    .text("Class", 32, y).text("Billed", 262, y).text("Collected", 382, y);
  y += 14;
  doc.moveTo(32, y).lineTo(462, y).lineWidth(0.5).strokeColor(LINE).stroke();
  y += 6;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  for (const r of byClass.rows) {
    if (y > doc.page.height - 60) { doc.addPage(); y = 48; }
    doc.text(r.class_name, 32, y)
      .text(kes(Number(r.billed)), 262, y)
      .text(kes(Number(r.collected)), 382, y);
    y += 15;
  }
  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
    .text(`Prepared ${new Date().toISOString().slice(0, 10)} from the live record.`, 32, y);
}
