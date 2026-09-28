"use client";

import { Money } from "@mandela/ui";
import type { LearnerTermStatement } from "@/lib/api";

const methodLabel: Record<string, string> = {
  cash: "Cash", mpesa: "M-Pesa", bank: "Bank transfer", cheque: "Cheque", other: "Other",
};

/**
 * The fee statement document. One ledger, one math — this component only
 * lays out what learnerTermStatement computed (the SAME query the guardian
 * app reads). Paper is white; money keeps its own ink, never lime.
 */
export function StatementDoc({ data }: { data: LearnerTermStatement }) {
  // school_settings may be unconfigured (fresh school) — degrade to the name,
  // never crash the document.
  const school = data.school ?? { name: "", contact_phone: null, contact_email: null, contact_address: null };
  const contacts = [school.contact_address, school.contact_phone, school.contact_email].filter(Boolean).join(" · ");
  const issued = data.issued_on ? new Date(data.issued_on).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div data-doc className="mx-auto max-w-[780px] bg-surface px-10 py-8">
      <header className="border-b-2 border-pine-700 pb-4">
        <p className="font-display text-[22px] font-bold tracking-tight text-pine-800">{school.name}</p>
        {contacts ? <p className="mt-1 text-[11.5px] text-ink-500">{contacts}</p> : null}
      </header>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="microlabel">Statement of account · {data.term}</p>
          <p className="font-display text-2xl font-bold text-ink-950">{data.learner}</p>
          <p className="text-[12.5px] text-ink-700">{data.class_name ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-500">Invoice no</p>
          <p className="font-mono text-[13px] font-semibold text-ink-950">{data.invoice_no}</p>
          <p className="text-[11px] text-ink-500">Issued {issued}</p>
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-paper-300">
            <th className="microlabel py-2">Item</th>
            <th className="microlabel py-2 text-right">Billed</th>
            <th className="microlabel py-2 text-right">Paid</th>
            <th className="microlabel py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it) => (
            <tr key={it.name} className="border-b border-paper-100">
              <td className="py-2 pr-3 text-ink-950">{it.name}</td>
              <td className="numeral py-2 text-right"><Money cents={it.billed_cents} /></td>
              <td className="numeral py-2 text-right text-ink-700"><Money cents={it.paid_cents} /></td>
              <td className="numeral py-2 text-right text-ink-950">
                {it.balance_cents > 0 ? <Money cents={it.balance_cents} /> : <span className="text-[12px] font-semibold text-ok">cleared</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-pine-700">
            <td className="py-2 font-semibold text-ink-950">Total</td>
            <td className="numeral py-2 text-right font-semibold text-ink-950"><Money cents={data.billed_cents} /></td>
            <td className="numeral py-2 text-right font-semibold text-ink-950"><Money cents={data.paid_cents} /></td>
            <td className="numeral py-2 text-right font-semibold text-ink-950"><Money cents={data.balance_cents} /></td>
          </tr>
        </tfoot>
      </table>

      <section className="mt-5">
        <p className="microlabel">Payments received this term</p>
        {data.payments.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-500">No payment recorded yet.</p>
        ) : (
          <ul className="mt-1 grid gap-1">
            {data.payments.map((p) => (
              <li key={p.receipt_no} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                <span className="font-mono text-[11.5px] text-ink-500">{p.receipt_no}</span>
                <span className="text-ink-700">
                  {methodLabel[p.method] ?? p.method}
                  {p.reference ? <span className="ml-1 font-mono text-[11px] text-ink-500">{p.reference}</span> : null}
                  <span className="ml-2 text-[11.5px] text-ink-500">
                    {new Date(p.paid_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span className="numeral font-semibold text-ink-950"><Money cents={p.amount_cents} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5 rounded-sm bg-paper-50 px-5 py-4">
        <p className="text-[11.5px] text-ink-500">Balance brought forward</p>
        <p className="numeral font-display text-[26px] font-bold text-ink-950"><Money cents={data.balance_cents} /></p>
        {data.credit_cents > 0 ? (
          <p className="mt-1 text-[12px] font-semibold text-ok">
            Overpayment of <Money cents={data.credit_cents} /> — shown honestly, carried to next term.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-[10.5px] text-ink-500">
        This statement is generated from the school ledger — the same figures the office holds.
      </p>

      <div className="mt-6 flex justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-10 rounded-pill bg-pine-700 px-5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
