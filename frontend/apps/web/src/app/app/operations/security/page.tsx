import { requireSession, requireBootstrap, getVisitors } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { VisitorDesk } from "./VisitorDesk";

/**
 * Security desk (flank batch D) — the gate's paper, digital: who is on
 * site right now, the 7-day visitor book, gate-pass numbers, and the
 * two-tap check-out. Counter and security roles write; office sees it.
 */
export default async function SecurityPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "security", "counter"].includes(me.principal.role ?? "")) redirect("/app");

  const v = await getVisitors();
  if (!("ok" in v) || !v.ok) {
    return (
      <>
        <SerifHeader crumb={`${boot.school.name} / Operations`} title="Security desk" />
        <p className="mt-6 text-[13px] text-ink-500">{"error" in v ? v.error : "unavailable"}</p>
      </>
    );
  }

  const today = v.rows.filter((r) => r.time_in.slice(0, 10) === new Date().toISOString().slice(0, 10));

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Security desk"
        sub="Every visitor signed in, every gate pass numbered, every exit logged."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="On site now" value={v.onSite} tone={v.onSite > 0 ? "warn" : "neutral"} note="visitors to check out" />
        <KpiCard label="Visitors today" value={today.length} />
        <KpiCard label="This week" value={v.rows.length} note="the visitor book" />
        <KpiCard label="Passes issued today" value={today.filter((r) => r.pass_no).length} tone="ok" />
      </div>

      <div className="mt-6">
        <VisitorDesk rows={v.rows} />
      </div>
    </>
  );
}
