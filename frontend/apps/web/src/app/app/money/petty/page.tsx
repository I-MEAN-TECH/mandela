import { requireSession, requireBootstrap, getPettyOverview } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { PettyClient } from "./PettyClient";

/**
 * Petty Cash & Budgets ⑮ (docs/BUILD-PHASES.md Phase 3) — the till, honest:
 * float in, spends out, approvals above the threshold, and the term budget
 * vs actual per cost center. Roles: admin/bursar (leaders decide).
 */
export default async function PettyPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "bursar", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const petty = await getPettyOverview();
  if ("error" in petty) {
    return (
      <div className="flex flex-col gap-s6">
        <AppLiveBar />
        <SerifHeader crumb="Money / Petty Cash" title="Petty Cash & Budgets" />
        <p className="text-[13px] text-danger">Could not load the till — is the API up?</p>
      </div>
    );
  }

  const canDecide = me.principal.role === "admin" || me.principal.role === "principal";
  const spentTerm = petty.budgets.reduce((a, b) => a + Number(b.spent_cents), 0);
  const budgetTotal = petty.budgets.reduce((a, b) => a + Number(b.budget_cents), 0);
  const budgetPct = budgetTotal > 0 ? Math.round((spentTerm / budgetTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Money / Petty Cash & Budgets"
        title="The till, honestly kept."
        sub="Every shilling in and out of petty cash, with who spent it and why. Spends above Ksh 200 wait for a leader's decision; budgets per cost center show actual against plan."
      />

      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Till balance" value={<Money cents={Number(petty.balanceCents)} />} note="top-ups minus approved spends" />
        <KpiCard label="Awaiting decision" value={petty.pending.length} note={petty.pending.length ? "decide below" : "nothing waiting"} tone={petty.pending.length ? "warn" : "ok"} />
        <KpiCard label="Spent this term" value={<Money cents={spentTerm} />} note="all cost centers" />
        <KpiCard
          label="Budget used"
          value={budgetTotal ? `${budgetPct}%` : "—"}
          note={budgetTotal ? `of ${Math.round(budgetTotal / 100).toLocaleString("en-KE")} Ksh planned` : "no budgets set yet"}
          meter={budgetTotal ? { value: Math.min(100, budgetPct), ok: budgetPct < 80 } : undefined}
          tone={budgetPct >= 100 ? "danger" : budgetPct >= 80 ? "warn" : "ok"}
        />
      </div>

      <PettyClient data={petty} canDecide={canDecide} canRecord={me.principal.role === "admin" || me.principal.role === "bursar"} />
    </div>
  );
}
