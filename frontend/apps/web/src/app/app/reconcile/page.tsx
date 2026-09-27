import { requireSession, requireBootstrap, getPendingPayments, confirmPaymentAction } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, Money, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { TwinLinks } from "@/components/TwinLinks";
import { AppLiveBar } from "../LiveBar";
import { ConfirmButtons } from "./ConfirmButtons";

/** Reconcile — the pending queue: confirm bank/cheque payments in one tap. */
export default async function ReconcilePage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const { pending } = await getPendingPayments();

  const total = pending.reduce((s, p) => s + Number(p.amount_cents), 0);

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>Clear the queue.</>}
        sub="Bank slips and cheques wait here until you confirm them. Confirming is audit-logged and issues the receipt."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <TwinLinks
          label="Confirm & Rails"
          twins={[
            { href: "/app/reconcile", label: "Confirm queue" },
            { href: "/app/money/rails", label: "Rails (CSV & M-Pesa)" },
          ]}
        />
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Awaiting confirmation" value={pending.length} note="payments in the queue" />
          <KpiCard label="Value pending" tone="warn" value={<Money cents={total} />} note="not yet in collections" />
          <KpiCard label="Oldest waiting" value={pending[0] ? new Date(pending[0].paid_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : "—"} note="first in, first confirmed" />
        </div>

        <Card>
          <CardHead title="Pending payments" sub="Oldest first — confirm when the money lands" />
          {pending.length === 0 ? (
            <EmptyState
              title="Queue is clear — done"
              body="Nothing is waiting. Pending payments appear here the moment they're recorded or flagged."
            />
          ) : (
            <div>
              {pending.map((p) => (
                <div key={p.receipt_no} className="flex flex-wrap items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">
                      {p.learner} · <Money cents={p.amount_cents} />
                    </p>
                    <p className="truncate font-mono text-[11.5px] text-muted">
                      {p.receipt_no} · {p.method}{p.reference ? ` · ${p.reference}` : ""} · {new Date(p.paid_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <StatusPill tone="warn">pending</StatusPill>
                    <ConfirmButtons receiptNo={p.receipt_no} action={confirmPaymentAction} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
