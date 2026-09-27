import { fetchPrintPayload } from "@/lib/printFetch";
import type { ReportCardPrint } from "@/lib/printTypes";
import { ReportCardDoc } from "./ReportCardDoc";

/**
 * Report card print view — the guardian-facing document (⑱ output).
 * Server-rendered so the browser's print dialog gets a finished A4 page:
 * letterhead from school_settings, the curriculum's own vocabulary and
 * grading scale from the card payload (never hardcoded), attendance, and
 * the signature line. Draft cards are refused for guardians at the API.
 */
export default async function ReportCardPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ cardId?: string; learnerId?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.cardId
    ? `cardId=${encodeURIComponent(sp.cardId)}`
    : sp.learnerId
      ? `learnerId=${encodeURIComponent(sp.learnerId)}`
      : "";
  const data = qs ? await fetchPrintPayload<ReportCardPrint>(`/web/print/report-card?${qs}`) : { error: "no card specified" };

  if ("error" in data) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Document unavailable</p>
        <p className="mt-2 text-sm text-ink-500">{data.error} — ask the school office for a printed copy.</p>
      </main>
    );
  }
  return <ReportCardDoc card={data} />;
}
