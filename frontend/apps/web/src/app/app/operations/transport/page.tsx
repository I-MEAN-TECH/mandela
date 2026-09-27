import { requireSession, requireBootstrap, getTransport } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TransportClient } from "./TransportClient";

/**
 * Transport ⑳ (docs/BUILD-PHASES.md Phase 2) — routes, buses, stops,
 * term manifests and the AM/PM trip log the driver dashboard will read.
 * Route fees ride Money ⑩ as levies when a route fee is set.
 */
export default async function TransportPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const data = await getTransport();
  const routes = "routes" in data ? data.routes : [];
  const buses = "buses" in data ? data.buses : [];
  const learnersOnRoutes = routes.reduce((a, r) => a + Number(r.learners), 0);

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Transport"
        title="Who rides, on which bus, paid for which route."
        sub="Routes with stops and term fees, buses with capacity, manifests per learner, and the AM/PM trip log. The driver gets Route · Manifest · Done on their own dashboard."
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Routes running" value={routes.filter((r) => r.active).length} />
        <KpiCard label="Buses" value={buses.length} />
        <KpiCard label="Learners on routes" value={learnersOnRoutes} />
        <KpiCard
          label="Route fees set"
          value={routes.filter((r) => Number(r.fee_term_cents) > 0).length}
          note={
            routes.length
              ? `avg Ksh ${Math.round(
                  routes.reduce((a, r) => a + Number(r.fee_term_cents), 0) / routes.length / 100,
                ).toLocaleString("en-KE")} / term`
              : "no routes"
          }
        />
      </div>
      <TransportClient routes={routes} buses={buses} trips={"trips" in data ? data.trips : []} />
    </div>
  );
}
