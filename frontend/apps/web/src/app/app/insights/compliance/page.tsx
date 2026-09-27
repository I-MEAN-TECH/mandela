import { requireSession, requireBootstrap, getCompliance } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ComplianceBoard, ComplianceCsvButton } from "./ComplianceClient";

/**
 * Compliance Center 28 — every regulatory line on one screen with
 * countdowns (docs/BUILD-PHASES.md Phase 1). The glance that turns data
 * hygiene from chore into one look; fix deep-links jump into the module
 * that owns the gap.
 */
export default async function CompliancePage() {
  const me = await requireSession();
  if (me.principal.kind !== "staff") redirect("/app");
  const boot = await requireBootstrap();
  const canEdit = me.principal.role === "admin" || me.principal.role === "principal";
  const data = await getCompliance();
  if ("error" in data) {
    return (
      <>
        <SerifHeader crumb={`${boot.school.name} / Insights`} title="Compliance Center" />
        <p className="mt-6 text-[13px] text-ink-500">{data.error}</p>
      </>
    );
  }

  const ready = data.lines.filter((l) => (l.pct === null ? l.done : l.pct >= 95)).length;
  const overdue = data.lines.filter((l) => l.days_left !== null && l.days_left < 0 && !l.done).length;
  const dueSoon = data.lines.filter((l) => l.days_left !== null && l.days_left >= 0 && l.days_left <= 30 && !l.done).length;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Insights`}
        title={<>Compliance, one glance.</>}
        sub="KEMIS candidates, TSC registration, the county licence — readiness, countdowns, and the exact record to fix."
        actions={<AppLiveBar />}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Compliance floor" value={`${data.worst_pct}%`} note="your weakest line" />
        <KpiCard label="Lines ready" value={`${ready} of ${data.lines.length}`} tone="ok" />
        <KpiCard label="Due in 30 days" value={dueSoon} tone={dueSoon > 0 ? "warn" : "neutral"} />
        <KpiCard label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "neutral"} note={data.next_deadline ? `next: ${data.next_deadline.label}` : undefined} />
      </div>

      <div className="mt-6 grid gap-6">
        <ComplianceBoard data={data} canEdit={canEdit} />
        <ComplianceCsvButton data={data} />
      </div>
    </>
  );
}
