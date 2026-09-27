import { requireSession, requireBootstrap, getSwitchingImports, getLearners, getGuardians, type SwitchingImportRow } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { SwitchImportClient } from "./SwitchImportClient";

/**
 * Switching import (flank #9) — the helper for schools leaving a competitor.
 * Paste their spreadsheet rows as JSON (one object per learner), the mapper
 * normalises the columns, you review, then commit imports them once.
 */
export default async function SwitchImportPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");

  const s = await getSwitchingImports();
  const l = await getLearners();
  const g = await getGuardians();
  const imports: SwitchingImportRow[] = s && "imports" in s && Array.isArray(s.imports) ? s.imports : [];
  const learners = l && "learners" in l ? l.learners : [];
  const guardians = g && "guardians" in g ? g.guardians.length : 0;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Settings`}
        title="Switch from another system"
        sub="Bring your learners and guardians over — map, review, commit. Never twice."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Learners in system" value={learners.length} />
        <KpiCard label="Guardians linked" value={guardians} />
        <KpiCard label="Imports run" value={imports.length} />
        <KpiCard label="Rows imported" value={imports.reduce((a, x) => a + (x.imported_count ?? 0), 0)} tone="ok" />
      </div>

      <div className="mt-6">
        <SwitchImportClient imports={imports} />
      </div>
    </>
  );
}
