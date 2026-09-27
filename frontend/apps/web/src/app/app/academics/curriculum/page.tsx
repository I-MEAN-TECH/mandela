import { requireSession, requireBootstrap, getCurriculumSetup } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { PackToggles, ClassLadder, ResolverProbe } from "./CurriculumClient";

/**
 * Curriculum Setup 16 — the school's switches over pack migrations 008-010
 * (docs/BUILD-PHASES.md Phase 1). Server page: admin/principal only (the
 * roles RLS lets write pack state); the resolver probe shows every staff
 * session what the adaptive forms will see — the adaptivity contract made
 * visible, not believed (docs/CURRICULUM-ARCHITECTURE.md 4.2).
 */
export default async function CurriculumSetupPage() {
  const me = await requireSession();
  if (me.principal.kind !== "staff" || !["admin", "principal"].includes(me.principal.role ?? "")) {
    redirect("/app");
  }
  const data = await getCurriculumSetup();
  if ("error" in data) {
    return (
      <>
        <SerifHeader  title="Curriculum Setup" />
        <p className="mt-6 text-[13px] text-ink-500">{data.error}</p>
      </>
    );
  }
  const boot = await requireBootstrap();

  const enabled = data.packs.filter((p) => p.enabled).length;
  const attached = data.classes.filter((c) => c.level_code).length;
  const unattached = data.classes.length - attached;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Academics`}
        title="Curriculum Setup"
        sub="The school runs the packs you switch on — forms, words and report cards follow."
        actions={<AppLiveBar />}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Packs enabled" value={`${enabled} of ${data.packs.length}`} note={data.packs.find((p) => p.is_default)?.code.toUpperCase()} />
        <KpiCard label="Classes on a ladder" value={attached} tone="ok" />
        <KpiCard label="Not attached" value={unattached} tone={unattached > 0 ? "warn" : "neutral"} />
        <KpiCard label="Areas in use" value={data.packs.reduce((n, p) => n + (p.enabled ? p.area_count : 0), 0)} note="across enabled packs" />
      </div>

      <div className="mt-6 grid gap-6">
        <PackToggles packs={data.packs} />
        <ClassLadder data={data} />
        {data.classes.length > 0 ? <ResolverProbe classIds={data.classes.map((c) => ({ id: c.id, name: c.name }))} /> : null}
      </div>
    </>
  );
}
