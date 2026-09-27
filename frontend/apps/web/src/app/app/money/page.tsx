import { requireSession, requireBootstrap, getCollections, getPayments, getLearners, recordPaymentAction } from "@/lib/api";
import { Card, CardHead, KpiCard, Meter, Money, StatusPill, DataTable, EmptyState, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { PayForm } from "./PayForm";

const ledgerColumns = [
  { key: "receipt_no", title: "Receipt" },
  { key: "learner", title: "Learner" },
  { key: "amount", title: "Amount", align: "right" as const },
  { key: "method", title: "Method" },
  { key: "state", title: "State" },
  { key: "paid_at", title: "Paid at" },
];

/** Money — comp 03: billed/collected/outstanding, collections table, record + ledger. */
export default async function MoneyPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const [collections, payments, learners] = await Promise.all([
    getCollections(),
    getPayments(),
    getLearners(),
  ]);

  const totalBilled = collections.collections.reduce((s, c) => s + Number(c.billed_cents), 0);
  const totalPaid = collections.collections.reduce((s, c) => s + Number(c.paid_cents), 0);
  const outstanding = Math.max(totalBilled - totalPaid, 0);
  const rate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const kes = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

  return (
    <div>
      <SerifHeader
        crumb="Money / Term 3"
        title={<>The money, by class.</>}
        sub="What's billed, what landed, and what to chase — one screen, one truth."
      />

      <div className="mt-s7 grid gap-s3h">
        {/* KPI trio */}
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Billed this term" value={<Money cents={totalBilled} />} note={`${learners.learners.length} ${noun(learners.learners.length, "learner")} on roll`} />
          <KpiCard label="Collected" tone="ok" value={<Money cents={totalPaid} />} note={`${rate}% of billed`} meter={{ value: rate, ok: true }} />
          <KpiCard label="Outstanding" tone="danger" value={<Money cents={outstanding} />} note={`${kes.format(outstanding / 100)} to collect`} meter={{ value: Math.max(100 - rate, 0) }} />
        </div>

        <div className="grid gap-s3h lg:grid-cols-3">
          {/* Collections table */}
          <Card className="lg:col-span-2">
            <CardHead title="Collections by class" sub="Billed vs collected, this term" />
            <DataTable
              columns={[
                { key: "class", title: "Class" },
                { key: "billed", title: "Billed", align: "right" },
                { key: "paid", title: "Paid", align: "right" },
                { key: "gap", title: "Gap", align: "right" },
                { key: "state", title: "State" },
              ]}
              rows={collections.collections.map((c) => {
                const billed = Number(c.billed_cents);
                const paid = Number(c.paid_cents);
                const pct = billed > 0 ? Math.round((paid / billed) * 100) : 0;
                return {
                  class: c.class,
                  billed: kes.format(billed / 100),
                  paid: kes.format(paid / 100),
                  gap: kes.format(Math.max(billed - paid, 0) / 100),
                  state: <StatusPill tone={pct >= 90 ? "ok" : pct >= 50 ? "warn" : "danger"}>{pct}%</StatusPill>,
                };
              })}
              empty={<EmptyState title="No fee items yet" body="Collections appear once fee items are billed." />}
            />
          </Card>

          {/* Record a payment */}
          <Card>
            <CardHead title="Record a payment" sub="Receipt issues instantly" />
            <PayForm learners={learners.learners} action={recordPaymentAction} />
          </Card>
        </div>

        {/* Ledger */}
        <Card>
          <CardHead title="Recent payments" sub="The ledger — newest first" />
          {payments.payments.length === 0 ? (
            <EmptyState title="No payments yet" body="Confirmed payments appear here instantly." />
          ) : (
            <DataTable
              columns={ledgerColumns}
              rows={payments.payments.map((p) => ({
                receipt_no: <span className="font-mono text-xs">{p.receipt_no}</span>,
                learner: p.learner,
                amount: <Money cents={p.amount_cents} />,
                method: <span className="capitalize">{p.method}</span>,
                state: <StatusPill tone={p.state === "confirmed" ? "ok" : p.state === "pending" ? "warn" : "danger"}>{p.state}</StatusPill>,
                paid_at: new Date(p.paid_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
