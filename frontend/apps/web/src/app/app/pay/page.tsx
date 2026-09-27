import { requireSession, requireBootstrap, getGuardianHome, recordPaymentAction, type GuardianHomeData } from "@/lib/api";
import { Card, CardHead, Money, StatusPill, Meter, EmptyState, SerifHeader } from "@mandela/ui";
import { PayButtons } from "./PayButtons";

/** Pay — the guardian's one screen: what do I owe, pay it, done. */
export default async function PayPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "guardian") {
    return (
      <div>
        <SerifHeader crumb="Money / Pay" title={<>Families pay here.</>} />
        <div className="mt-s7">
          <EmptyState title="Staff record payments from Money" body="The bursar's Money screen handles receipts, records and the ledger." />
        </div>
      </div>
    );
  }
  const data = (await getGuardianHome()) as GuardianHomeData;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Pay`}
        title={<>What do I owe, and when?</>}
        sub="Pay the full balance or half now — receipts land on your phone instantly."
      />

      <div className="mt-s7 grid gap-s3h lg:grid-cols-2">
        {"error" in data ? (
          <EmptyState title="Could not load balances" body="Try again shortly — the school database did not respond." />
        ) : (
          data.learners.map((l) => {
            const due = Number(data.due_cents[l.id] ?? 0);
            const paid = Number(data.paid_this_term_cents[l.id] ?? 0);
            const balance = Math.max(due - paid, 0);
            const pct = due > 0 ? Math.round((paid / due) * 100) : 100;
            return (
              <Card key={l.id}>
                <CardHead
                  title={l.name}
                  sub={l.class ?? undefined}
                  action={balance === 0 ? <StatusPill tone="ok">Fully paid</StatusPill> : <StatusPill tone="danger">Balance due</StatusPill>}
                />
                <div className="grid grid-cols-3 gap-s3">
                  <div>
                    <p className="microlabel">Billed</p>
                    <p className="numeral mt-1.5 text-lg font-semibold"><Money cents={due} /></p>
                  </div>
                  <div>
                    <p className="microlabel">Paid</p>
                    <p className="numeral mt-1.5 text-lg font-semibold text-ok"><Money cents={paid} /></p>
                  </div>
                  <div>
                    <p className="microlabel">Balance</p>
                    <p className={`numeral mt-1.5 text-lg font-semibold ${balance > 0 ? "text-danger" : "text-ok"}`}>
                      <Money cents={balance} />
                    </p>
                  </div>
                </div>
                <div className="mt-s4">
                  <Meter value={pct} ok={pct >= 100} />
                </div>
                {balance > 0 ? (
                  <PayButtons learnerId={l.id} balanceCents={balance} action={recordPaymentAction} />
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
