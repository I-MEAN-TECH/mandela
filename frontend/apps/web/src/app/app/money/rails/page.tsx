import { requireSession, requireBootstrap, getRailsOverview, getLearners } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { CsvImportCard, RailsQueue } from "./RailsClient";

/**
 * Money Rails 14 (docs/BUILD-PHASES.md Phase 2) — the assist layer.
 * Daraja C2B + bank CSV land as suggestions; the bursar confirms in one tap.
 * The manual-entry share is kept honestly visible — rails never replace the
 * hand (manual-first law). Roles: admin/bursar.
 */
export default async function RailsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "bursar"].includes(me.principal.role ?? "")) redirect("/app");

  const [rails, learners] = await Promise.all([getRailsOverview(), getLearners()]);
  if ("error" in rails) redirect("/app/money");

  const learnerList = learners.learners
    .filter((l) => l.status === "active")
    .slice(0, 300)
    .map((l) => ({ id: l.id, name: `${l.name} · ${l.admission_no}` }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title={<>Money rails, assist only.</>}
        sub="Bank statements and M-Pesa callbacks become suggestions — the engine guesses, you confirm in one tap. When the API is down or power is out, you key by hand and the system never blinks."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="Exact matches" value={rails.stats.auto} note="admission no in the reference" />
          <KpiCard label="Name guesses" value={rails.stats.suggested} note="verify before confirming" />
          <KpiCard label="Unmatched" value={rails.stats.unmatched} note="pick the learner by hand" />
          <KpiCard label="Manual-entry share" value={`${rails.stats.manualShare}%`} note="kept visible — the hand still leads" />
        </div>

        <div className="grid gap-s3h xl:grid-cols-[1fr_380px]">
          <RailsQueue rows={rails.suggestions} learners={learnerList} />
          <div className="flex flex-col gap-s3h">
            <CsvImportCard />
            <Card>
              <CardHead title="Daraja C2B" sub="M-Pesa callbacks land here as suggestions" />
              <EmptyState
                title="Rail not connected yet"
                body="Turn it on in Settings › Integrations. Until then, STK/C2B rows key in by hand — the manual-first law means nothing blocks."
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
