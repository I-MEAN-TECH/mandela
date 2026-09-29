import { filterPayments, paginatePayments } from "./PaymentsLedger";

const payments = [
  { id: "1", receipt_no: "R-001", learner: "Amina Otieno", class_name: "Grade 7 Blue", method: "mpesa", state: "confirmed", paid_at: "2026-09-29T08:00:00.000Z" },
  { id: "2", receipt_no: "R-002", learner: "Brian Kamau", class_name: "Grade 7 Green", method: "cash", state: "pending", paid_at: "2026-09-28T08:00:00.000Z" },
];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

assert(filterPayments(payments, { className: "Grade 7 Blue", method: "mpesa", state: "confirmed" }).length === 1, "payment filters combine class, method, and state");
assert(filterPayments(payments, { query: "R-002", dateFrom: "2026-09-28", dateTo: "2026-09-28" }).length === 1, "payment search and date range match ledger rows");
assert(paginatePayments(Array.from({ length: 26 }, (_, id) => id), 1, 25).length === 1, "payment pagination bounds rendered rows");
