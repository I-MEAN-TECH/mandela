import { requireSession, requireBootstrap, getFacilities } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { FacilitiesClient } from "./FacilitiesClient";

/**
 * Facilities & Maintenance ㊴ (docs/BUILD-PHASES.md Phase 2) — the
 * classroom-furniture core: anyone reports in two taps, the repair-vs-replace
 * verdict is DATA (the <50% rule), structural damage goes out-of-service.
 */
export default async function FacilitiesPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const data = await getFacilities();
  const rows = "rows" in data ? data.rows : [];
  const kpis = "kpis" in data ? data.kpis : { open: 0, structural: 0, replace_ct: 0, est_total_cents: "0" };

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Facilities"
        title="Report it before it breaks someone."
        sub="Teachers and janitors file in two taps — room, item, photo. Structural damage never waits: it goes out-of-service immediately, and the repair-vs-replace verdict is the <50% rule, computed, not argued."
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open repairs" value={kpis.open} tone={kpis.open > 0 ? "warn" : "ok"} />
        <KpiCard label="Structural (out of service)" value={kpis.structural} tone={kpis.structural > 0 ? "danger" : "ok"} />
        <KpiCard label="Replace verdicts queued" value={kpis.replace_ct} note="cost ≥ 50% of replacement" />
        <KpiCard label="Estimated repair cost" value={<Money cents={kpis.est_total_cents} />} note="open items" />
      </div>
      <FacilitiesClient rows={rows} />
    </div>
  );
}
