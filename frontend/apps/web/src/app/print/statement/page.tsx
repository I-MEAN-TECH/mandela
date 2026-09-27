import { fetchPrintPayload } from "@/lib/printFetch";
import type { LearnerTermStatement } from "@/lib/api";
import { StatementDoc } from "./StatementDoc";

/**
 * Fee statement print view — the paper proof (⑬ output, manual-first law).
 * Same payload as the in-app statement sheet and the guardian endpoint:
 * ONE ledger, ONE math. A4 server-rendered page with the payment history
 * and the honest credit line.
 */
export default async function StatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ learnerId?: string }>;
}) {
  const sp = await searchParams;
  const data = sp.learnerId
    ? await fetchPrintPayload<LearnerTermStatement>(`/web/print/statement/${encodeURIComponent(sp.learnerId)}`)
    : { error: "no learner specified" };

  if ("error" in data) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Document unavailable</p>
        <p className="mt-2 text-sm text-ink-500">{data.error} — ask the school office for a printed copy.</p>
      </main>
    );
  }
  return <StatementDoc data={data} />;
}
