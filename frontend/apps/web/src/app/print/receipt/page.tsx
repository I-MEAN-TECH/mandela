import { fetchPrintPayload } from "@/lib/printFetch";
import type { PaymentReceiptData } from "@/lib/api";
import { ReceiptDoc } from "./ReceiptDoc";

/**
 * Receipt print view — the proof a guardian keeps. Server-rendered A4:
 * school letterhead, who paid, how much, by what method (with the
 * method's own details — M-Pesa code, slip, cheque), and the receipt
 * number as the reference for any question that comes later.
 */
export default async function ReceiptPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ receiptNo?: string }>;
}) {
  const sp = await searchParams;
  const data = sp.receiptNo
    ? await fetchPrintPayload<PaymentReceiptData>(`/web/print/receipt?receiptNo=${encodeURIComponent(sp.receiptNo)}`)
    : { error: "no receipt specified" as const };

  if ("error" in data) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Receipt unavailable</p>
        <p className="mt-2 text-sm text-ink-500">{data.error} — check the receipt number in the ledger.</p>
      </main>
    );
  }

  return <ReceiptDoc data={data} />;
}
