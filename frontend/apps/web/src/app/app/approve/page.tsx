import { requireSession, requireBootstrap, getPendingPayments, confirmPaymentAction, getStaffDirectory, type PendingPaymentRow, type StaffRow } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, Money, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../LiveBar";
import { ConfirmButtons } from "../reconcile/ConfirmButtons";

/** Approve — the principal's desk: confirm payments, see the staff register. */
export default async function ApprovePage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const [pendingRes, staffRes] = await Promise.all([getPendingPayments(), getStaffDirectory()]);
  const pending: PendingPaymentRow[] = pendingRes.pending;
  const staff: StaffRow[] = staffRes.staff ?? [];
  const total = pending.reduce((s, p) => s + Number(p.amount_cents), 0);
  const activeStaff = staff.filter((s) => s.active).length;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Principal`}
        title={<>What needs you.</>}
        sub="Pending money to confirm, the staff register at a glance — approvals are audit-logged."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Payments to approve" value={pending.length} note="bank slips & cheques" />
          <KpiCard label="Value waiting" tone="warn" value={<Money cents={total} />} note="not yet collected" />
          <KpiCard label="Active staff" value={activeStaff} note={`of ${staff.length} registered`} />
        </div>

        <Card>
          <CardHead title="Confirm payments" sub="Confirming issues the receipt and logs the audit entry" />
          {pending.length === 0 ? (
            <EmptyState title="Nothing to approve — done" body="The money queue is clear." />
          ) : (
            <div>
              {pending.map((p) => (
                <div key={p.receipt_no} className="flex flex-wrap items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">
                      {p.learner} · <Money cents={p.amount_cents} />
                    </p>
                    <p className="truncate font-mono text-[11.5px] text-muted">
                      {p.receipt_no} · {p.method}{p.reference ? ` · ${p.reference}` : ""}
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

        <Card>
          <CardHead title="Staff register" sub={`${activeStaff} active of ${staff.length}`} />
          <div>
            {staff.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{s.full_name}</p>
                  <p className="truncate font-mono text-[11.5px] text-muted">{s.classes ?? s.email ?? "—"}</p>
                </div>
                <StatusPill tone={s.active ? "ok" : "neutral"}>{s.role}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
