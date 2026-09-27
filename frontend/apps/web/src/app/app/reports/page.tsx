import { requireSession, requireBootstrap, getCollections, getPayments } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../LiveBar";

/** Reports — the bursar's term report: billed vs collected, print-ready. */
export default async function ReportsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const [collections, payments] = await Promise.all([getCollections(), getPayments()]);
  const billed = collections.collections.reduce((s, c) => s + Number(c.billed_cents), 0);
  const paid = collections.collections.reduce((s, c) => s + Number(c.paid_cents), 0);
  const rate = billed > 0 ? Math.round((paid / billed) * 100) : 0;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>The term, in numbers.</>}
        sub="Billed vs collected by class — the report you can hand to the board."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Billed this term" value={<Money cents={billed} />} note={`${collections.collections.length} ${noun(collections.collections.length, "class", "classes")}`} />
          <KpiCard label="Collected" tone="ok" value={<Money cents={paid} />} note={`${rate}% of billed`} />
          <KpiCard label="Gap" tone={billed - paid > 0 ? "danger" : "ok"} value={<Money cents={Math.max(billed - paid, 0)} />} note="still with guardians" />
        </div>

        <Card>
          <CardHead title="Collections by class" sub="Full term, all classes" />
          {collections.collections.length === 0 ? (
            <EmptyState title="No fee items yet" body="Reports fill in once fee items are billed." />
          ) : (
            <DataTable
              columns={[
                { key: "class", title: "Class" },
                { key: "billed", title: "Billed", align: "right" },
                { key: "paid", title: "Paid", align: "right" },
                { key: "gap", title: "Gap", align: "right" },
                { key: "rate", title: "Rate", align: "right" },
              ]}
              rows={collections.collections.map((c) => {
                const b = Number(c.billed_cents);
                const p = Number(c.paid_cents);
                return {
                  class: c.class,
                  billed: <Money cents={b} />,
                  paid: <Money cents={p} />,
                  gap: <Money cents={Math.max(b - p, 0)} />,
                  rate: `${b > 0 ? Math.round((p / b) * 100) : 0}%`,
                };
              })}
            />
          )}
        </Card>

        <Card>
          <CardHead title="Payment mix" sub={`Last ${payments.payments.length} receipts by method`} />
          <MethodMix payments={payments.payments} />
        </Card>
      </div>
    </div>
  );
}

function MethodMix({ payments }: { payments: { method: string; amount_cents: string }[] }) {
  const byMethod = new Map<string, number>();
  for (const p of payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount_cents));
  const total = [...byMethod.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return <EmptyState title="No payments yet" body="The mix appears as payments are recorded." />;
  return (
    <div className="grid gap-s3">
      {[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([method, cents]) => (
        <div key={method} className="flex items-center gap-s3">
          <span className="w-16 shrink-0 text-[13px] font-semibold capitalize">{method}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-paper-100">
            <div className="h-full rounded-pill bg-primary" style={{ width: `${Math.round((cents / total) * 100)}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
            {Math.round((cents / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
