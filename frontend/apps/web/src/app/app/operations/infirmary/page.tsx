import { requireSession, requireBootstrap, getInfirmary, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TwinLinks } from "@/components/TwinLinks";
import { InfirmaryClient } from "./InfirmaryClient";

/**
 * Infirmary (docs/BUILD-PHASES.md Phase 2) — health records + clinic visits,
 * DPA-strict like counselling: the nurse hat + principal read contents;
 * everyone else (including this admin) sees counts only.
 */
export default async function InfirmaryPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (["driver"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const [data, learners] = await Promise.all([getInfirmary(), getLearners()]);
  const roster = learners.learners.filter((l) => l.status === "active").map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Care / Infirmary & Security"
        title="Health data is dignity data."
        sub="Allergies, chronic conditions, immunizations — parent-declared at enrolment. Clinic visits logged SOAP-lite, medication charted-as-given with kit stock auto-deducting."
      />
      <TwinLinks
        label="Care"
        twins={[
          { href: "/app/operations/infirmary", label: "Infirmary" },
          { href: "/app/operations/security", label: "Security desk" },
        ]}
      />
      <div className="grid gap-s4 sm:grid-cols-3">
        <KpiCard label="Health records" value={"stats" in data ? data.stats.records_ct : 0} />
        <KpiCard label="Clinic visits (30 days)" value={"stats" in data ? data.stats.visits_30d : 0} />
        <KpiCard label="Allergy flags" value={"stats" in data ? data.stats.open_allergies : 0} tone={"stats" in data && data.stats.open_allergies > 0 ? "warn" : "ok"} />
      </div>
      <InfirmaryClient
        data={"canOpen" in data ? data : null}
        learners={roster}
      />
    </div>
  );
}
