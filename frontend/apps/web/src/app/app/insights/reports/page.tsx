import { requireSession, requireBootstrap } from "@/lib/api";
import { SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ReportBuilderClient } from "./ReportBuilderClient";

/**
 * Report Builder ㉙ — Phase 3. Pick a dataset, slice it, export the CSV.
 * v1 ships the three honest datasets (money by class, attendance by class
 * x day, conduct by kind); more arrive as modules earn them.
 */
export default async function ReportBuilderPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Insights`}
        title={<>Any report, any slice.</>}
        sub="Pick a dataset, search it, sort it, export the CSV — the same DB numbers every screen shows, on one sheet for the board."
        actions={<AppLiveBar />}
      />
      <div className="mt-s7">
        <ReportBuilderClient />
      </div>
    </div>
  );
}
