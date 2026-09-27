import { requireSession, requireBootstrap, getStaffDirectory, getHrOverview } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { HrClient } from "./HrClient";

/**
 * HR & Leave ⑥ (docs/BUILD-PHASES.md Phase 3) — the ledger, not a filing
 * cabinet: who is out today, what awaits a decision, days taken vs
 * entitlement per BOM kind. The two-leaders model decides; every write
 * is audited.
 */
export default async function HrPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const [hr, staffRes] = await Promise.all([getHrOverview(), getStaffDirectory()]);
  const activeStaff = staffRes.staff ?? [];
  if ("error" in hr) {
    return (
      <div className="flex flex-col gap-s6">
        <AppLiveBar />
        <SerifHeader crumb="People / HR & Leave" title="HR & Leave" />
        <p className="text-[13px] text-danger">Could not load the leave ledger — is the API up?</p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const outToday = hr.onLeaveToday.length;
  const pending = hr.pending.length;
  const activeCount = activeStaff.filter((s) => s.active).length;
  const annual = hr.balances
    .filter((b) => b.kind === "annual")
    .reduce((a, b) => a + b.taken, 0);

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="People / HR & Leave"
        title="HR & Leave"
        sub="The leave ledger — who is out, what waits on a decision, days against entitlement. Every decision carries a reason and lands on the audit trail."
      />

      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="On leave today" value={outToday} note={`${today} · approved leave only`} tone={outToday > 0 ? "warn" : "ok"} />
        <KpiCard label="Awaiting decision" value={pending} note={pending ? "decide below — reason mandatory" : "nothing waiting"} tone={pending > 0 ? "warn" : "ok"} />
        <KpiCard label="Active staff" value={activeCount} note="on the register" />
        <KpiCard label="Annual days taken" value={annual} note="all staff, this calendar year" />
      </div>

      <HrClient
        data={hr}
        staff={activeStaff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.full_name, role: s.role }))}
        canDecide={me.principal.role === "admin" || me.principal.role === "principal"}
      />
    </div>
  );
}
