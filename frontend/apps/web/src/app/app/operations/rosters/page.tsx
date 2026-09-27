import { requireSession, requireBootstrap, getDutyRoster, getStaffDirectory } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { RostersClient } from "./RostersClient";

/**
 * Duty rosters (flank #6) — who covers morning, break, lunch, evening and
 * night, on which day. The "when" the duties registry alone cannot answer.
 */
export default async function RostersPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "deputy", "teacher"].includes(me.principal.role ?? "")) redirect("/app");

  const r = await getDutyRoster();
  const dir = await getStaffDirectory();
  const rows = r && "rows" in r ? r.rows : [];
  const staff = dir.staff.filter((s) => s.active);

  const active = rows.filter((x) => x.active);
  const slots = [...new Set(active.map((x) => x.slot))];

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Duty rosters"
        sub="Who covers what, when — morning gate to night dorm rounds."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Active slots" value={active.length} note="this week" />
        <KpiCard label="Staff on duties" value={new Set(active.map((x) => x.staff_id)).size} />
        <KpiCard label="Times of day" value={slots.length} note={slots.join(" · ") || "none"} />
        <KpiCard label="Weekdays covered" value={new Set(active.map((x) => x.weekday)).size} tone="ok" />
      </div>

      <div className="mt-6">
        <RostersClient rows={rows} staff={staff.map((s) => ({ id: s.id, name: s.full_name }))} />
      </div>
    </>
  );
}
