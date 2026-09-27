"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money } from "@mandela/ui";
import { createInvoiceItemAction, type LearnerTermStatement } from "@/lib/api";

/**
 * Invoices & Statements 13 — the editor + the statement sheet.
 * Forms follow docs/FORM-NAV-STANDARDS.md: one column, top labels, inline
 * validation. Manual-first law: the bursar keys the invoice line by hand —
 * no auto-generation exists to depend on. The statement sheet renders the
 * SAME payload the guardian app calls, and prints on real paper (a receipt
 * or a statement the parent can hold) — paper-proof exports, law of trust.
 */

const inputCx =
  "w-full rounded-sm border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine focus:outline-none";
const labelCx = "mb-1 block text-[13px] font-semibold text-ink-900";

export function AddItemForm({ learners }: { learners: { id: string; name: string; sub: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function submit(fd: FormData) {
    const learnerId = String(fd.get("learnerId") ?? "");
    const name = String(fd.get("name") ?? "").trim();
    const amount = Number(String(fd.get("amount") ?? ""));
    if (!learnerId) return setErr("Choose the learner this bill is for.");
    if (name.length < 2) return setErr("Give the invoice line a name (min 2 letters).");
    if (!Number.isFinite(amount) || amount <= 0) return setErr("Enter the amount in Ksh (numbers only).");
    setErr(null);
    start(async () => {
      const r = await createInvoiceItemAction({ learnerId, name, amountCents: Math.round(amount * 100) });
      if (r && "error" in r) return setErr(r.error ?? "Could not save.");
      const okMsg = (r as { ok?: boolean; error?: string });
      if (okMsg && okMsg.ok === false) return setErr(okMsg.error ?? "Could not save.");
      setOk(`“${name}” billed — the statement updates below.`);
      setTimeout(() => setOk(null), 3000);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Bill a learner" sub="You key the line — one audit row, no auto-generation" />
      <form action={submit} className="grid gap-s2">
        <div>
          <label className={labelCx} htmlFor="inv-learner">Learner</label>
          <select id="inv-learner" name="learnerId" className={inputCx} defaultValue="">
            <option value="">Choose learner…</option>
            {learners.map((l) => (
              <option key={l.id} value={l.id}>{l.name} — {l.sub}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-s2 sm:grid-cols-2">
          <div>
            <label className={labelCx} htmlFor="inv-name">Item name</label>
            <input id="inv-name" name="name" className={inputCx} placeholder="Exam fee" required />
          </div>
          <div>
            <label className={labelCx} htmlFor="inv-amount">Amount (Ksh)</label>
            <input id="inv-amount" name="amount" inputMode="decimal" className={inputCx} placeholder="2500" required />
          </div>
        </div>
        {err ? <p className="text-sm font-semibold text-danger">{err}</p> : null}
        {ok ? <p className="text-sm font-semibold text-ok">{ok}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Billing…" : "Bill learner"}</Button>
      </form>
    </Card>
  );
}

const methodLabel: Record<string, string> = {
  mpesa: "M-Pesa",
  cash: "Cash",
  bank: "Bank",
  cheque: "Cheque",
};

function StatementSheet({ learnerId, onClose }: { learnerId: string; onClose: () => void }) {
  const [data, setData] = useState<LearnerTermStatement | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/statement?learnerId=${encodeURIComponent(learnerId)}`)
      .then((r) => r.json())
      .then((j: LearnerTermStatement | { error: string }) => {
        if (alive) setData(j);
      })
      .catch(() => {
        if (alive) setData({ error: "statement unavailable" });
      });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [learnerId, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Learner statement">
      <div data-statement className="w-full max-w-[720px] rounded bg-surface p-6 shadow-2 sm:p-8">
        {data === null ? (
          <p className="py-16 text-center text-sm text-ink-500">Loading statement…</p>
        ) : "error" in data ? (
          <p className="py-16 text-center text-sm font-semibold text-danger">{data.error}</p>
        ) : (
          <div className="grid gap-s3">
            {/* Letterhead — everything from school_settings (no hardcoding) */}
            <div className="border-b border-paper-200 pb-4">
              <p className="font-display text-lg font-bold text-ink-950">{data.school.name}</p>
              <p className="text-xs text-ink-500">
                {[data.school.contact_address, data.school.contact_phone, data.school.contact_email]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Statement of account</p>
                <p className="font-display text-xl font-bold text-ink-950">{data.learner}</p>
                <p className="text-xs text-ink-500">{data.class_name ?? "—"} · {data.term}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-ink-500">Invoice no</p>
                <p className="font-mono text-sm font-semibold text-ink-950">{data.invoice_no}</p>
                <p className="text-[11px] text-ink-500">Issued {data.issued_on}</p>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Billed</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.name} className="border-b border-paper-100">
                    <td className="py-2 pr-2 text-ink-900">{it.name}</td>
                    <td className="py-2 text-right tabular-nums"><Money cents={it.billed_cents} /></td>
                    <td className="py-2 text-right tabular-nums text-ok"><Money cents={it.paid_cents} /></td>
                    <td className="py-2 text-right tabular-nums text-ink-900">
                      {it.balance_cents > 0 ? <Money cents={it.balance_cents} /> : <span className="text-ok">cleared</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-2 font-semibold text-ink-950">Total</td>
                  <td className="py-2 text-right font-semibold tabular-nums"><Money cents={data.billed_cents} /></td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ok"><Money cents={data.paid_cents} /></td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ink-950"><Money cents={data.balance_cents} /></td>
                </tr>
              </tfoot>
            </table>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Payments this term</p>
              {data.payments.length === 0 ? (
                <p className="text-sm text-ink-500">No payment recorded yet.</p>
              ) : (
                <ul className="grid gap-1">
                  {data.payments.map((p) => (
                    <li key={p.receipt_no} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="font-mono text-xs text-ink-500">{p.receipt_no}</span>
                      <span className="text-ink-700">{methodLabel[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <span className="tabular-nums font-semibold text-ink-950"><Money cents={p.amount_cents} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-sm bg-paper-50 px-4 py-3">
              <p className="text-xs text-ink-500">Balance brought forward</p>
              <p className="font-display text-2xl font-bold tabular-nums text-ink-950">
                <Money cents={data.balance_cents} />
              </p>
              {data.credit_cents > 0 ? (
                <p className="mt-1 text-xs font-semibold text-ok">
                  Overpayment of <Money cents={data.credit_cents} /> — shown honestly, carried for next term.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 print:hidden">
              <p className="text-xs text-ink-500">This is the same figure the parent sees — one ledger, no arguments.</p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Close</Button>
                <Button
                  variant="secondary"
                  onClick={() => window.open(`/print/statement?learnerId=${encodeURIComponent(learnerId)}`, "_blank", "noopener")}
                >
                  A4 print page
                </Button>
                {/* C13 — server-rendered PDF bytes: same ledger, emailed/archivable. */}
                <Button
                  variant="secondary"
                  onClick={() => window.open(`/api/pdf?kind=statement&learnerId=${encodeURIComponent(learnerId)}`, "_blank", "noopener")}
                >
                  Download PDF
                </Button>
                <Button onClick={() => window.print()}>Print / PDF</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ViewStatementButton({ learnerId, learner }: { learnerId: string; learner: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>{`Statement · ${learner.split(" ")[0]}`}</Button>
      {open ? <StatementSheet learnerId={learnerId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
