"use client";

import type { PaymentReceiptData, PaymentDetails } from "@/lib/api";

type ReceiptPayload = PaymentReceiptData;

/**
 * The official receipt document. Paper is white — the state is spelled out
 * so photocopies stay honest, and the method's own proof (M-Pesa code,
 * slip, cheque) prints on the face of the receipt.
 */
export function ReceiptDoc({ data }: { data: ReceiptPayload }) {
  const d: PaymentDetails = data.details ?? {};
  const school = data.school ?? { name: "", contact_phone: null, contact_email: null, contact_address: null };
  const contacts = [school.contact_address, school.contact_phone, school.contact_email].filter(Boolean).join(" · ");
  const amount = `Ksh ${Number(data.amount).toLocaleString("en-KE")}`;

  const methodRows: [string, string][] =
    data.method === "mpesa"
      ? [["M-Pesa code", d.mpesa_code ?? "—"], ["Phone used", d.mpesa_phone ?? "—"], ["Time received", d.mpesa_time ?? "—"]]
      : data.method === "bank"
        ? [["Slip number", d.slip_no ?? "—"], ["Bank", d.bank_name ?? "—"]]
        : data.method === "cheque"
          ? [["Cheque number", d.cheque_no ?? "—"], ["Cheque date", d.cheque_date ?? "—"], ["Bank", d.bank_name ?? "—"]]
          : [["Received in", "Cash at the school office"]];

  return (
    <main className="mx-auto max-w-[720px] bg-white px-8 py-10 text-ink-950">
      <header className="border-b-2 border-ink-950 pb-4 text-center">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">{school.name}</h1>
        {contacts ? <p className="mt-1 text-[12px] text-ink-500">{contacts}</p> : null}
        <p className="mt-3 font-display text-lg font-bold">OFFICIAL RECEIPT</p>
      </header>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="text-[13px]">
          <p><span className="text-ink-500">Received from:</span> <span className="font-semibold">{data.learner}</span></p>
          <p className="mt-0.5"><span className="text-ink-500">Class:</span> {data.class_name ?? "—"}</p>
          <p className="mt-0.5"><span className="text-ink-500">Adm no:</span> <span className="font-mono">{data.admission_no ?? "—"}</span></p>
        </div>
        <div className="text-right text-[13px]">
          <p><span className="text-ink-500">Receipt no:</span> <span className="font-mono font-bold">{data.receipt_no}</span></p>
          <p className="mt-0.5">
            <span className="text-ink-500">Date:</span>{" "}
            {new Date(data.paid_at).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="mt-0.5"><span className="text-ink-500">State:</span> <span className="capitalize">{data.state}</span></p>
        </div>
      </div>

      <div className="mt-6 border-2 border-ink-950 p-4 text-center">
        <p className="text-[12px] uppercase tracking-wide text-ink-500">Amount received</p>
        <p className="numeral mt-1 font-display text-3xl font-bold">{amount}</p>
      </div>

      <table className="mt-6 w-full text-left text-[13px]">
        <tbody>
          <tr className="border-b border-paper-200">
            <th className="w-[40%] py-2 font-semibold">Being payment by</th>
            <td className="py-2 capitalize">{data.method}</td>
          </tr>
          {methodRows.map(([k, v]) => (
            <tr key={k} className="border-b border-paper-200">
              <th className="py-2 font-semibold">{k}</th>
              <td className={`py-2 ${/code|slip|cheque number/i.test(k) ? "font-mono" : ""}`}>{v}</td>
            </tr>
          ))}
          {data.reference ? (
            <tr className="border-b border-paper-200">
              <th className="py-2 font-semibold">Reference</th>
              <td className="py-2">{data.reference}</td>
            </tr>
          ) : null}
          {data.recorded_by ? (
            <tr className="border-b border-paper-200">
              <th className="py-2 font-semibold">Recorded by</th>
              <td className="py-2">{data.recorded_by}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="mt-10 flex items-end justify-between gap-8">
        <p className="flex-1 text-[10.5px] text-ink-500">This receipt is generated from the school ledger — figures agree with the office copy.</p>
        <div className="w-40 border-t border-ink-950/40 pt-1.5 text-center text-[11.5px] text-ink-700">Authorised signature</div>
      </div>

      <div className="mt-6 flex justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-10 rounded-pill bg-pine-700 px-5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          Print / Save as PDF
        </button>
      </div>
    </main>
  );
}
