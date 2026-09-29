import { requireSession, requireBootstrap, getClasses, getLearners, getFeeStructures, getFeeDiscounts, getFeePlans, getFeeExtras } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, SerifHeader, Money } from "@mandela/ui";
import { redirect } from "next/navigation";
import { TwinLinks } from "@/components/TwinLinks";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../../LiveBar";
import { StructureForm, ApplyButton, ConsentToggle, LevyConsentDesk, DiscountForm, PlanForm } from "./FeesClient";

/**
 * Fee Structures ⑫ — the editor (docs/BUILD-PHASES.md Phase 1).
 * Own screen, own cards/forms/charts per the blueprint. Roles: the money
 * roles see everything; teacher/counter are redirected to their homes.
 */
export default async function FeeStructuresPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  // 028 IA: principal lost the direct "Payroll" tab — payroll remains one
  // tap away via the twin row; bursar/counter are redirected.
  if (["teacher", "counter", "driver"].includes(me.principal.role ?? "")) redirect("/app");

  const [fees, discounts, plans, classes, learners, extras] = await Promise.all([
    getFeeStructures(),
    getFeeDiscounts(),
    getFeePlans(),
    getClasses(),
    getLearners(),
    getFeeExtras(),
  ]);
  if ("error" in fees || "error" in discounts || "error" in plans) redirect("/app/money");

  const rows = fees.rows;
  const required = rows.filter((r) => !r.is_optional);
  const optional = rows.filter((r) => r.is_optional);
  const totalRequired = required.reduce((s, r) => s + Number(r.amount_cents), 0);
  const scheduledTotal = plans.reduce((s, p) => s + Number(p.total_cents), 0);
  const classList = classes.classes.map((c) => ({ id: c.id, name: c.name }));
  const learnerList = learners.learners.slice(0, 200).map((l) => ({
    id: l.id,
    name: l.name,
  }));
  const discountPct = "discountPct" in extras ? extras.discountPct : 0;
  const avgFee = "avgFeeCents" in extras ? extras.avgFeeCents : 0;
  const learnersCharged = "learnersCharged" in extras ? extras.learnersCharged : 0;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>Fees, set once.</>}
        sub={`Structures, sibling discounts and instalment plans for ${fees.currentTerm.label}. You key the lines; “Apply to class” only assists — every bill stays attributable.`}
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
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="Required per learner" value={<Money cents={totalRequired} />} note={`${required.length} automatic ${required.length === 1 ? "item" : "items"}`} />
          <KpiCard label="Optional levies" value={optional.length} note="billed after consent" />
          <KpiCard label="Discount rules" value={discounts.filter((d) => d.active).length} note={"discountPct" in extras ? `leakage ${extras.discountPct}% of billed value` : "sibling rules active"} />
          <KpiCard ink label="Avg fee per learner" value={<Money cents={avgFee} />} note={`${learnersCharged} ${noun(learnersCharged, "learner")} billed`} />
        </div>

        <div className="grid gap-s3h">
          <Card className="min-w-0">
            <CardHead title="Fee structures" sub={`${fees.currentTerm.label} · per-learner amounts`} />
            {rows.length === 0 ? (
              <EmptyState title="No fee items yet" body="Add the first fee item on the right — it becomes this term's billing line." />
            ) : (
              <DataTable
                columns={[
                  { key: "name", title: "Item" },
                  { key: "class", title: "Class" },
                  { key: "amount", title: "Amount", align: "right" },
                  { key: "consent", title: "Billing" },
                  { key: "apply", title: "" },
                ]}
                rows={rows.map((r) => ({
                  name: r.name,
                  class: r.class_name ?? "All classes",
                  amount: <Money cents={r.amount_cents} />,
                  consent: (
                    <span className="inline-flex items-center gap-2">
                      {r.is_optional ? (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn">after consent</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">automatic</span>
                      )}
                      <ConsentToggle structureId={r.id} isOptional={r.is_optional} />
                    </span>
                  ),
                  apply: <ApplyButton structureId={r.id} name={r.name} />,
                }))}
              />
            )}
          </Card>
          <div className="grid gap-s3h">
            <StructureForm classes={classList} />
            <LevyConsentDesk
              structures={optional.map((o) => ({ id: Number(o.id), name: o.name }))}
              learners={learnerList}
            />
          </div>
        </div>

        <div className="grid gap-s3h">
          <Card className="min-w-0">
            <CardHead title="Sibling discounts" sub="Family money — the Nth child pays less" />
            {discounts.length === 0 ? (
              <EmptyState title="No rules yet" body="Families with more than one child here deserve the family price. Add the rule on the right." />
            ) : (
              <DataTable
                columns={[
                  { key: "name", title: "Rule" },
                  { key: "scope", title: "Scope" },
                  { key: "nth", title: "From child", align: "right" },
                  { key: "off", title: "Off", align: "right" },
                ]}
                rows={discounts.map((d) => ({
                  name: d.name,
                  scope: d.class_name ?? "All classes",
                  nth: `#${d.applies_from}`,
                  off: `${d.percent_off}%`,
                }))}
              />
            )}
          </Card>
          <DiscountForm classes={classList} />
        </div>

        <div className="grid gap-s3h">
          <Card className="min-w-0">
            <CardHead title="Instalment plans" sub="Live plans this term · what's paid vs scheduled" />
            {plans.length === 0 ? (
              <EmptyState title="No plans yet" body="When a parent can't pay all at once, agree the parts here — the balance gets a calendar, not a standoff." />
            ) : (
              <DataTable
                columns={[
                  { key: "learner", title: "Learner" },
                  { key: "class", title: "Class" },
                  { key: "plan", title: "Plan" },
                  { key: "progress", title: "Paid / scheduled", align: "right" },
                  { key: "due", title: "Next due" },
                ]}
                rows={plans.map((p) => ({
                  learner: p.learner,
                  class: p.class_name ?? "—",
                  plan: `${p.plan_name} · ${p.parts} parts`,
                  progress: (
                    <span className="tabular-nums">
                      <Money cents={p.paid_cents} /> <span className="text-ink-400">/</span> <Money cents={p.total_cents} />
                    </span>
                  ),
                  due: p.next_due ?? "—",
                }))}
              />
            )}
          </Card>
          <PlanForm learners={learnerList} />
        </div>
      </div>
    </div>
  );
}
