import { requireSession, requireBootstrap, getMessWeek } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { MenuBoard, HeadCountBoard } from "./MessClient";

/**
 * Mess (flank batch D) — the dining hall's week: the menu on one board,
 * head-counts per meal (which the cook reads against the store), all
 * live. Mess staff and teachers take counts; office can edit both.
 */
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["breakfast", "tea", "lunch", "supper"] as const;

export default async function MessPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const w = await getMessWeek();
  if (!("ok" in w) || !w.ok) {
    return (
      <>
        <SerifHeader crumb={`${boot.school.name} / Operations`} title="Mess" />
        <p className="mt-6 text-[13px] text-ink-500">{"error" in w ? w.error : "unavailable"}</p>
      </>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayCounts = w.counts.filter((c) => c.meal_day === todayIso);
  const totalToday = todayCounts.reduce((s, c) => s + c.head_count, 0);
  const mealsSet = w.menu.length;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Mess"
        sub={`The week's menu and who ate — week of ${w.weekStart}. Head-counts drive the store draw.`}
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Served today" value={totalToday} note={`${todayCounts.length} of 4 meals counted`} />
        <KpiCard label="Menu lines set" value={mealsSet} note="of 28 (7 days × 4 meals)" />
        <KpiCard label="Meals today" value={MEALS.length} />
        <KpiCard label="Week starts" value={w.weekStart} tone="ok" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <MenuBoard weekStart={w.weekStart} menu={w.menu} dayNames={DAY_NAMES} meals={[...MEALS]} />
        <HeadCountBoard weekStart={w.weekStart} counts={w.counts} dayNames={DAY_NAMES} meals={[...MEALS]} />
      </div>
    </>
  );
}
