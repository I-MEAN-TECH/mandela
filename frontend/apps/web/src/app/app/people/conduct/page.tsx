import { requireSession, requireBootstrap, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ConductClient } from "./ConductClient";

/**
 * Conduct & Welfare (docs/BUILD-PHASES.md Phase 2) — ㊹ Discipline & Merits
 * and ㊺ Counselling on one calm screen, separated by design: discipline is
 * administrative, counselling is therapeutic. The DPA law is enforced in
 * the API — this admin page can only ever receive the counselling COUNT.
 */
export default async function ConductPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal", "teacher"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const learners = await getLearners();
  const roster = learners.learners ?? [];

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="People / Conduct & Welfare"
        title="Conduct & Welfare"
        sub="Merit and demerit incidents with parent notifications, beside the confidential counselling register — visible here only as counts, never as case contents."
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Learners on record" value={roster.length} note="Pick a learner to record an incident" />
      </div>
      <ConductClient learners={roster.map((l) => ({ id: l.id, name: l.name, class: l.class }))} />
    </div>
  );
}
