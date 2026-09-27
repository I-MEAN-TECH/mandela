import { requireSession, requireBootstrap, getLevies } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, SerifHeader, Money } from "@mandela/ui";
import { redirect } from "next/navigation";
import { TwinLinks } from "@/components/TwinLinks";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../LiveBar";

/** Levies — what the school bills, per class, optional levies marked. */
export default async function LeviesPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (["teacher", "driver"].includes(me.principal.role ?? "")) redirect("/app");
  const { levies } = await getLevies();

  const required = levies.filter((l) => !l.is_optional);
  const optional = levies.filter((l) => l.is_optional);
  const totalRequired = required.reduce((s, l) => s + Number(l.amount_cents), 0);

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>What the school charges.</>}
        sub="Fee structures for the current term. Optional levies need a guardian's consent before they bill."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <TwinLinks
          label="Pricing"
          twins={[
            { href: "/app/money/fees", label: "Fee structures" },
            { href: "/app/levies", label: "Levies" },
          ]}
        />
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Required per learner" value={<Money cents={totalRequired} />} note={`${required.length} ${noun(required.length, "item")} this term`} />
          <KpiCard label="Optional levies" value={optional.length} note="billed only after consent" />
          <KpiCard label="Structures" value={levies.length} note="across all classes" />
        </div>

        <Card>
          <CardHead title="Fee structures" sub="Current term · per-learner amounts" />
          {levies.length === 0 ? (
            <EmptyState
              title="No fee structures yet"
              body="Levies appear here once the school defines its fee structure for the term."
            />
          ) : (
            <DataTable
              columns={[
                { key: "name", title: "Item" },
                { key: "class", title: "Class" },
                { key: "amount", title: "Amount", align: "right" },
                { key: "consent", title: "Consent" },
              ]}
              rows={levies.map((l) => ({
                name: l.name,
                class: l.class ?? "All classes",
                amount: <Money cents={l.amount_cents} />,
                consent: l.is_optional ? (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn">optional</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">automatic</span>
                ),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
