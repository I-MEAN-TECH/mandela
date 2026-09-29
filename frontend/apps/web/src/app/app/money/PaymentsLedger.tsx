"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, DataTable, EmptyState, Money, StatusPill } from "@mandela/ui";
import { updatePaymentAction, type PaymentRow, type PaymentDetails } from "@/lib/api";

const METHODS = ["mpesa", "cash", "bank", "cheque"] as const;
const PAGE_SIZE = 25;

export type PaymentFilters = { query?: string; className?: string; method?: string; state?: string; dateFrom?: string; dateTo?: string };
type FilterablePayment = Pick<PaymentRow, "receipt_no" | "learner" | "class_name" | "method" | "state" | "paid_at">;

/** Narrows the already-authorized ledger response; it never changes access. */
export function filterPayments<T extends FilterablePayment>(payments: T[], filters: PaymentFilters): T[] {
  const term = filters.query?.trim().toLowerCase() ?? "";
  return payments.filter((payment) => {
    const day = payment.paid_at.slice(0, 10);
    if (filters.className && payment.class_name !== filters.className) return false;
    if (filters.method && payment.method !== filters.method) return false;
    if (filters.state && payment.state !== filters.state) return false;
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    return !term || payment.receipt_no.toLowerCase().includes(term) || payment.learner.toLowerCase().includes(term) || (payment.class_name ?? "").toLowerCase().includes(term);
  });
}

export function paginatePayments<T>(rows: T[], page: number, pageSize = PAGE_SIZE): T[] {
  return rows.slice(Math.max(0, page) * pageSize, Math.max(0, page + 1) * pageSize);
}

/**
 * The payments ledger — newest first, and every row answers for itself:
 * View shows the captured proof, Edit corrects it (audited, admin/bursar),
 * Print opens the receipt. A payment that was keyed wrong stays findable
 * and fixable — never silently wrong.
 */
export function PaymentsLedger({ payments, canEdit }: { payments: PaymentRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("");
  const [method, setMethod] = useState("");
  const [state, setState] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterPayments(payments, { query, className, method, state, dateFrom, dateTo }), [payments, query, className, method, state, dateFrom, dateTo]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visiblePayments = paginatePayments(filtered, Math.min(page, pageCount - 1));
  const classNames = useMemo(() => [...new Set(payments.map((payment) => payment.class_name).filter((value): value is string => Boolean(value)))].sort(), [payments]);
  const states = useMemo(() => [...new Set(payments.map((payment) => payment.state))].sort(), [payments]);
  const resetPage = () => setPage(0);

  return (
    <Card>
      <CardHead title="Recent payments" sub="The ledger — newest first. Every row: view, edit, print." />
      <div className="grid gap-2 border-b border-paper-200 pb-s4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Payment filters">
        <label className="text-[12px] font-semibold text-ink-700">Search receipt or learner<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Receipt, learner or class…" className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2.5 text-[12.5px]" /></label>
        <label className="text-[12px] font-semibold text-ink-700">Class<select value={className} onChange={(event) => { setClassName(event.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]"><option value="">All classes</option>{classNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-[12px] font-semibold text-ink-700">Method<select value={method} onChange={(event) => { setMethod(event.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]"><option value="">All methods</option>{METHODS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-[12px] font-semibold text-ink-700">State<select value={state} onChange={(event) => { setState(event.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]"><option value="">All states</option>{states.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-[12px] font-semibold text-ink-700">From date<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]" /></label>
        <label className="text-[12px] font-semibold text-ink-700">To date<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); resetPage(); }} className="mt-1 h-9 w-full rounded-sm border border-paper-300 bg-surface px-2 text-[12.5px]" /></label>
      </div>
      {payments.length === 0 ? (
        <EmptyState title="No payments yet" body="Confirmed payments appear here instantly." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No payments match" body="Clear or widen the ledger filters to see authorized payments." />
      ) : (
        <>
          <DataTable
            columns={[
              { key: "receipt_no", title: "Receipt" },
              { key: "learner", title: "Learner" },
              { key: "amount", title: "Amount", align: "right" },
              { key: "method", title: "Method" },
              { key: "state", title: "State" },
              { key: "paid_at", title: "Paid at" },
              { key: "actions", title: "", align: "right" },
            ]}
            rows={visiblePayments.map((p) => ({
              receipt_no: <span className="font-mono text-xs">{p.receipt_no}</span>,
              learner: (
                <span>
                  {p.learner}
                  {p.class_name ? <span className="text-muted"> · {p.class_name}</span> : null}
                </span>
              ),
              amount: <Money cents={p.amount_cents} />,
              method: <span className="capitalize">{p.method}</span>,
              state: <StatusPill tone={p.state === "confirmed" ? "ok" : p.state === "pending" ? "warn" : "danger"}>{p.state}</StatusPill>,
              paid_at: new Date(p.paid_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
              actions: (
                <span className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewing(p)}
                    className="h-8 rounded-pill border border-border bg-surface px-3 text-[12px] font-semibold hover:bg-paper-100"
                    aria-label={`View ${p.receipt_no}`}
                  >
                    View
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="h-8 rounded-pill border border-border bg-surface px-3 text-[12px] font-semibold hover:bg-paper-100"
                      aria-label={`Edit ${p.receipt_no}`}
                    >
                      Edit
                    </button>
                  ) : null}
                  <a
                    href={`/print/receipt?receiptNo=${encodeURIComponent(p.receipt_no)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-pill border border-border bg-surface px-3 text-[12px] font-semibold hover:bg-paper-100"
                    aria-label={`Print ${p.receipt_no}`}
                  >
                    Print
                  </a>
                </span>
              ),
            }))}
          />
          {filtered.length > PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px] text-ink-600">
              <span>{Math.min(page * PAGE_SIZE + 1, filtered.length)}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <span className="flex gap-2">
                <Button size="sm2" variant="ghost" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
                <Button size="sm2" variant="ghost" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
              </span>
            </div>
          ) : null}
          {msg ? (
            <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
          ) : null}
        </>
      )}

      {viewing ? <ViewDialog payment={viewing} onClose={() => setViewing(null)} /> : null}
      {editing ? (
        <EditDialog
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ ok: true, text });
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

/** Read-only proof: everything captured for this payment, method included. */
function ViewDialog({ payment: p, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const d = p.details ?? {};
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal onClick={onClose}>
      <div className="w-full max-w-md rounded-sm border border-border bg-surface p-s5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Receipt {p.receipt_no}</h3>
          <StatusPill tone={p.state === "confirmed" ? "ok" : "warn"}>{p.state}</StatusPill>
        </div>
        <dl className="mt-s4 grid gap-2 text-[13px]">
          <Row k="Learner" v={`${p.learner}${p.class_name ? ` · ${p.class_name}` : ""}`} />
          <Row k="Amount" v={`Ksh ${Number(p.amount_cents).toLocaleString("en-KE")}`} />
          <Row k="Method" v={p.method} />
          {p.method === "mpesa" ? (
            <>
              <Row k="M-Pesa code" v={d.mpesa_code ?? "—"} mono />
              <Row k="Phone used" v={d.mpesa_phone ?? "—"} />
              <Row k="Time received" v={d.mpesa_time ?? "—"} />
            </>
          ) : null}
          {p.method === "bank" ? (
            <>
              <Row k="Slip number" v={d.slip_no ?? "—"} mono />
              <Row k="Bank" v={d.bank_name ?? "—"} />
            </>
          ) : null}
          {p.method === "cheque" ? (
            <>
              <Row k="Cheque number" v={d.cheque_no ?? "—"} mono />
              <Row k="Cheque date" v={d.cheque_date ?? "—"} />
              <Row k="Bank" v={d.bank_name ?? "—"} />
            </>
          ) : null}
          {p.reference ? <Row k="Reference" v={p.reference} /> : null}
          <Row k="Paid at" v={new Date(p.paid_at).toLocaleString("en-KE")} />
        </dl>
        <div className="mt-s4 flex flex-wrap gap-s3">
          <a
            href={`/print/receipt?receiptNo=${encodeURIComponent(p.receipt_no)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-pill border border-border px-4 text-[13px] font-semibold hover:bg-paper-100"
          >
            Open receipt
          </a>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

/** Edit: amount, method (with its proof fields), reference, paid-at. */
function EditDialog({ payment: p, onClose, onSaved }: {
  payment: PaymentRow;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const d = p.details ?? {};
  const [amount, setAmount] = useState((Number(p.amount_cents) / 100).toString());
  const [method, setMethod] = useState<string>(p.method);
  const [reference, setReference] = useState(p.reference ?? "");
  const [mpesaCode, setMpesaCode] = useState(d.mpesa_code ?? "");
  const [mpesaPhone, setMpesaPhone] = useState(d.mpesa_phone ?? "");
  const [mpesaTime, setMpesaTime] = useState(d.mpesa_time ?? "");
  const [slipNo, setSlipNo] = useState(d.slip_no ?? "");
  const [bankName, setBankName] = useState(d.bank_name ?? "");
  const [chequeNo, setChequeNo] = useState(d.cheque_no ?? "");
  const [chequeDate, setChequeDate] = useState(d.cheque_date ?? "");
  const [paidAt, setPaidAt] = useState(() => {
    const dt = new Date(p.paid_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    const amountNum = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setErr("Amount must be greater than zero");
      return;
    }
    if (method === "mpesa" && !mpesaCode.trim()) { setErr("M-Pesa code is required"); return; }
    if (method === "bank" && !slipNo.trim()) { setErr("Slip number is required"); return; }
    if (method === "cheque" && !chequeNo.trim()) { setErr("Cheque number is required"); return; }
    const details: PaymentDetails =
      method === "mpesa" ? { mpesa_code: mpesaCode, mpesa_phone: mpesaPhone, mpesa_time: mpesaTime }
      : method === "bank" ? { slip_no: slipNo, bank_name: bankName }
      : method === "cheque" ? { cheque_no: chequeNo, cheque_date: chequeDate, bank_name: bankName }
      : {};
    setPending(true);
    setErr(null);
    void (async () => {
      const r = await updatePaymentAction({
        paymentId: p.id,
        amountCents: Math.round(amountNum * 100),
        method,
        reference: reference || null,
        details,
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
      });
      setPending(false);
      if (r.ok) onSaved(`Updated ${p.receipt_no} — change recorded in the audit log`);
      else setErr(r.error ?? "Failed to update");
    })();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-border bg-surface p-s5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold">Edit {p.receipt_no}</h3>
        <p className="mt-1 text-[12.5px] text-muted">Every change is written to the audit log with what it was before.</p>
        <div className="mt-s4 grid gap-2 text-[13px]">
          <label htmlFor="edit-amount" className="block font-semibold">Amount (Ksh)</label>
          <input id="edit-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <label htmlFor="edit-method" className="block font-semibold">Method</label>
          <select id="edit-method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {method === "mpesa" ? (
            <>
              <label htmlFor="edit-mpesa-code" className="block font-semibold">M-Pesa code *</label>
              <input id="edit-mpesa-code" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <label htmlFor="edit-mpesa-phone" className="block font-semibold">Phone used</label>
              <input id="edit-mpesa-phone" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </>
          ) : null}
          {method === "bank" ? (
            <>
              <label htmlFor="edit-slip" className="block font-semibold">Slip number *</label>
              <input id="edit-slip" value={slipNo} onChange={(e) => setSlipNo(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <label htmlFor="edit-bank" className="block font-semibold">Bank</label>
              <input id="edit-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </>
          ) : null}
          {method === "cheque" ? (
            <>
              <label htmlFor="edit-cheque" className="block font-semibold">Cheque number *</label>
              <input id="edit-cheque" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <label htmlFor="edit-cheque-date" className="block font-semibold">Cheque date</label>
              <input id="edit-cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <label htmlFor="edit-cheque-bank" className="block font-semibold">Bank</label>
              <input id="edit-cheque-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </>
          ) : null}
          <label htmlFor="edit-ref" className="block font-semibold">Reference</label>
          <input id="edit-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <label htmlFor="edit-paidat" className="block font-semibold">Paid at</label>
          <input id="edit-paidat" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {err ? <p className="mt-3 text-[12.5px] text-danger" role="alert">{err}</p> : null}
        <div className="mt-s4 flex gap-s3">
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-paper-200 pb-1.5 last:border-b-0">
      <dt className="text-ink-500">{k}</dt>
      <dd className={`text-right font-semibold text-ink-950 ${mono ? "font-mono" : ""}`}>{v}</dd>
    </div>
  );
}
