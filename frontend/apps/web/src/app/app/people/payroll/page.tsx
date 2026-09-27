import { requireSession, requireBootstrap, getPayrollDashboard } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../../LiveBar";
import { PayrollChart, StatutoryChecklist, ExportCsv } from "./PayrollDashClient";

/**
 * Payroll dashboard (flank batch C) — salaries due vs collected, staff paid,
 * the statutory checklist, the cost chart, and the CSV seam. The run editor
 * (compute → approve → disburse) stays on the existing Payroll screen.
 */
export default async function PayrollDashPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "bursar", "hr"].includes(me.principal.role ?? "")) redirect("/app");

  const dash = await getPayrollDashboard();
  if (!("ok" in dash) || !dash.ok) {
    return (
      <>
        <SerifHeader crumb={`${boot.school.name} / People`} title="Payroll dashboard" />
        <p className="mt-6 text-[13px] text-ink-500">{"error" in dash ? dash.error : "unavailable"}</p>
      </>
    );
  }

  const netShare = dash.collectedCents > 0 ? Math.min(100, Math.round((100 * dash.grossDueCents) / dash.collectedCents)) : 0;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / People`}
        title="Payroll dashboard"
        sub="What the school owes its people, what the law is owed, and whether collections cover it."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label={`Salaries due · ${dash.month}`} value={<Money cents={dash.grossDueCents} />} note={`${dash.staffPaid} ${noun(dash.staffPaid, "staff", "staff")} on the run`} />
        <KpiCard label="Collected this month" value={<Money cents={dash.collectedCents} />} tone="ok" />
        <KpiCard
          label="Collections cover payroll"
          value={`${dash.collectedCents > 0 ? 100 - Math.min(100, netShare) : 0}%`}
          note="headroom after salaries"
          tone={dash.collectedCents >= dash.grossDueCents ? "ok" : "warn"}
        />
        <KpiCard label="Run state" value={dash.runState} note="this month's payroll run" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <PayrollChart data={dash} />
        <StatutoryChecklist checks={dash.checks} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <ExportCsv month={dash.month} />
        <Link href="/app/people/staff" className="text-[13px] font-semibold text-pine-700 underline-offset-4 hover:underline">
          Payroll runs &amp; contracts →
        </Link>
      </div>
    </>
  );
}
