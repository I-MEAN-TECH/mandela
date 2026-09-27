import { requireSession, requireBootstrap, getHostel, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TwinLinks } from "@/components/TwinLinks";
import { HostelClient } from "./HostelClient";

/**
 * Hostel ㉓ (docs/BUILD-PHASES.md Phase 2) — dorms, allocations, exeat
 * passes, nightly roll-call. Beds/mattresses are asset rows in Facilities;
 * damage costs flowing to fee ledgers lands with Spending (Phase 3).
 */
export default async function HostelPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (["driver"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const [data, learners] = await Promise.all([getHostel(), getLearners()]);
  const roster = learners.learners.filter((l) => l.status === "active").map((l) => ({ id: l.id, name: l.name }));
  const dorms = "dorms" in data ? data.dorms : [];

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Care / Hostel & Mess"
        title="Every boarder, every bed, every night."
        sub="Dorms and allocations, exeat passes with approvals, and the one-tap nightly roll-call — a missing boarder escalates, never waits for the morning."
      />
      <TwinLinks
        label="Care"
        twins={[
          { href: "/app/operations/hostel", label: "Hostel" },
          { href: "/app/operations/mess", label: "Mess" },
        ]}
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Boarders" value={"boarders" in data ? data.boarders : 0} />
        <KpiCard label="Dorms" value={dorms.length} />
        <KpiCard label="Exeat requests open" value={"exeat" in data ? data.exeat.filter((e) => e.state === "requested").length : 0} tone="warn" />
        <KpiCard
          label="Last roll-call"
          value={"last_rollcall" in data && data.last_rollcall[0] ? `${data.last_rollcall[0].present}/${data.last_rollcall[0].total}` : "—"}
          note={"last_rollcall" in data && data.last_rollcall[0] ? data.last_rollcall[0].night : "none yet"}
          tone={"last_rollcall" in data && data.last_rollcall[0] && data.last_rollcall[0].present < data.last_rollcall[0].total ? "danger" : "ok"}
        />
      </div>
      <HostelClient
        dorms={dorms}
        exeat={"exeat" in data ? data.exeat : []}
        learners={roster}
      />
    </div>
  );
}
