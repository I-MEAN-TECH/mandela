import { requireSession, requireBootstrap, getInvoices, getLearners } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../../LiveBar";
import { AddItemForm, ViewStatementButton } from "./InvoicesClient";

/**
 * Invoices & Statements 13 (docs/BUILD-PHASES.md Phase 1).
 * Own screen, own cards/forms/tables per the blueprint. The bursar keys
 * invoice data by hand (manual-first law); the per-learner statement is
 * the SAME query the guardian app calls — the trust fix, live.
 * Roles: money roles + counter see everything; others go home.
 */
export default async function InvoicesPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "bursar", "counter"].includes(me.principal.role ?? "")) redirect("/app");

  const [invoices, learners] = await Promise.all([getInvoices(), getLearners()]);
  if ("error" in invoices) redirect("/app/money");

  const rows = invoices.rows;
  const billed = rows.reduce((s, r) => s + Number(r.billed_cents), 0);
  const paid = rows.reduce((s, r) => s + Number(r.paid_cents), 0);
  const cleared = rows.filter((r) => Number(r.balance_cents) <= 0).length;
  const clearedPct = rows.length ? Math.round((cleared / rows.length) * 100) : 0;
  const learnerList = learners.learners.slice(0, 200).map((l) => ({
    id: l.id,
    name: l.name,
    sub: (l as { class_name?: string | null }).class_name ?? "—",
  }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>Invoices & Statements.</>}
        sub={`${invoices.term} · You key the bill, the bursar keys the receipt — and parent and office see the same figure, from the same query.`}
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="Billed this term" value={<Money cents={billed} />} note={`${rows.length} ${noun(rows.length, "learner")} on the ledger`} />
          <KpiCard label="Collected against bills" value={<Money cents={paid} />} note={`${billed > 0 ? Math.round((paid / billed) * 100) : 0}% of billed`} />
          <KpiCard label="Outstanding" value={<Money cents={billed - paid} />} note="the chase list, biggest first" />
          <KpiCard label="Cleared" value={`${clearedPct}%`} note={`${cleared} of ${rows.length} accounts at zero`} />
        </div>

        <div className="grid gap-s3h xl:grid-cols-[1fr_360px]">
          <Card className="min-w-0">
            <CardHead title="Learner ledgers" sub={`${invoices.term} · billed − paid = balance · FIFO waterfall, always in order`} />
            {rows.length === 0 ? (
              <EmptyState
                title="No learner is billed yet"
                body="Apply a fee structure in Fees, or key the first bill on the right — the statement builds itself from the ledger."
              />
            ) : (
              <DataTable
                columns={[
                  { key: "learner", title: "Learner" },
                  { key: "class", title: "Class" },
                  { key: "items", title: "Bills", align: "right" },
                  { key: "billed", title: "Billed", align: "right" },
                  { key: "paid", title: "Paid", align: "right" },
                  { key: "balance", title: "Balance", align: "right" },
                  { key: "open", title: "" },
                ]}
                rows={rows.map((r) => ({
                  learner: (
                    <span>
                      <span className="font-semibold text-ink-950">{r.learner}</span>
                      {r.credit_cents !== "0" ? (
                        <span className="ml-2 inline-flex items-center rounded-pill bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">credit</span>
                      ) : null}
                    </span>
                  ),
                  class: r.class_name ?? "—",
                  items: r.items,
                  billed: <Money cents={r.billed_cents} />,
                  paid: <Money cents={r.paid_cents} />,
                  balance: (
                    <span className={Number(r.balance_cents) > 0 ? "font-semibold" : "text-ok"}>
                      {Number(r.balance_cents) > 0 ? <Money cents={r.balance_cents} /> : "cleared"}
                    </span>
                  ),
                  open: <ViewStatementButton learnerId={r.learner_id} learner={r.learner} />,
                }))}
              />
            )}
          </Card>
          <AddItemForm learners={learnerList} />
        </div>
      </div>
    </div>
  );
}
