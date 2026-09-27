/**
 * smoke:money - the money-path e2e smoke (hardening slice).
 * Walks the manual-first law end to end against the live API:
 *   record a payment -> (confirm if pended) -> statement -> collections
 *   move -> report dataset agrees. Handles both record shapes (some paths
 *   confirm instantly; the pending queue holds bank/cheque). Exits 1 on
 *   any broken link.
 * Run: node backend/apps/api/src/scripts/smoke-money.mjs
 */
const API = process.env.MANDELA_API_URL ?? "http://localhost:4000";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.mandela.school";
const AMOUNT_CENTS = 25_000; // Ksh 250

let failures = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!cond) failures++;
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

const t0 = Date.now();
const login = await call("/web/login/staff", { method: "POST", body: { email: EMAIL } });
check("login", login.json.ok === true && Boolean(login.json.token), login.json.error ?? "");
if (!login.json.token) process.exit(1);
const cookie = `mandela_session=${login.json.token}`;

// 1. a learner to bill
const learners = await call("/web/learners", { cookie });
const learner = (learners.json.learners ?? []).find((l) => l.status === "active");
check("learners list", Boolean(learner), learner?.name ?? "none");

// 2. collections before
const before = await call("/web/money/collections", { cookie });
const paidBefore = (before.json.collections ?? []).reduce((s, c) => s + Number(c.paid_cents), 0);

// 3. record (pending or instant - both are honest paths)
const rec = await call("/web/money/payments", {
  method: "POST",
  cookie,
  body: { learnerId: learner.id, amountCents: AMOUNT_CENTS, method: "cash", reference: "SMOKE" },
});
check("record payment", rec.json.ok !== false, JSON.stringify(rec.json).slice(0, 120));

// 4. if it pended, confirm it; else find the instant receipt
let receiptNo = rec.json.receipt_no ?? rec.json.payment?.receipt_no ?? null;
if (!receiptNo) {
  const pending = await call("/web/money/pending", { cookie });
  const row = (pending.json.pending ?? []).find(
    (p) => (p.learner_id === learner.id || p.learner?.id === learner.id) && Number(p.amount_cents) === AMOUNT_CENTS,
  );
  receiptNo = row?.receipt_no ?? null;
  check("pending queue holds it", Boolean(row), receiptNo ?? "not found");
  if (receiptNo) {
    const conf = await call("/web/money/payments/confirm", { method: "POST", cookie, body: { receiptNo } });
    check("confirm", conf.json.ok !== false, JSON.stringify(conf.json).slice(0, 120));
  }
} else {
  check("recorded straight to a receipt", true, receiptNo);
}

// 5. statement shows the receipt
const stmt = await call(`/web/admin/invoices/statement/${learner.id}`, { cookie });
check("statement carries the receipt", JSON.stringify(stmt.json).includes(receiptNo ?? "@@never@@"));

// 6. collections moved by exactly the amount
const after = await call("/web/money/collections", { cookie });
const paidAfter = (after.json.collections ?? []).reduce((s, c) => s + Number(c.paid_cents), 0);
check("collections grew by the amount", paidAfter - paidBefore === AMOUNT_CENTS, `+${paidAfter - paidBefore} cents`);

// 7. the report dataset agrees (Phase 3 builder floor)
const ds = await call("/web/admin/reports/money", { cookie });
const dsPaid = (ds.json.rows ?? []).reduce((s, r) => s + Number(r.paid ?? 0), 0);
check("report dataset agrees", Array.isArray(ds.json.rows) && dsPaid === paidAfter, `dataset paid ${dsPaid}`);

console.log(failures === 0 ? `\nAll green in ${Date.now() - t0}ms - the money path holds.` : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
