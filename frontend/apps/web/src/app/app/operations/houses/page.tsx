import { requireSession, requireBootstrap, listHousesAction, getCoCurricular, getHouseCompetitions } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { HousesClient } from "./HousesClient";

/**
 * Houses & Co-curricular (35) — sports/pastoral houses with live points and
 * the activity sections (clubs, teams, drama) with their fees and events.
 * One screen: the whole co-curricular life of the school.
 */
export default async function HousesPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const h = await listHousesAction();
  const c = await getCoCurricular();
  const comp = await getHouseCompetitions();
  const houses = Array.isArray(h) ? h : "houses" in h ? h.houses : [];
  const co = c && "sections" in c ? c : { sections: [], fees: [] };
  const competitions = comp && "rows" in comp ? comp.rows : [];
  const totalPoints = houses.reduce((a, x) => a + x.points, 0);
  const members = co.sections.reduce((a, x) => a + x.members, 0);

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Houses & Co-curricular"
        sub="Houses compete, clubs run, teams travel — all of it counted."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Houses" value={houses.length} note="points race live" />
        <KpiCard label="Points awarded" value={totalPoints} tone="ok" />
        <KpiCard label="Activity sections" value={co.sections.length} note="clubs · teams · arts" />
        <KpiCard label="Members" value={members} note="learners in activities" />
      </div>

      <div className="mt-6">
        <HousesClient houses={houses} sections={co.sections} fees={co.fees} competitions={competitions} />
      </div>
    </>
  );
}
