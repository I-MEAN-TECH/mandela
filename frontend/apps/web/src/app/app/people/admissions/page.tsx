import { requireSession, requireBootstrap, getAdmissions, getAdmissionsAnalytics, getCurriculumSetup } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { FunnelBoard, NewInquiryForm } from "./AdmissionsClient";
import { DirectAdmissionForm } from "./DirectAdmissionForm";
import { AdmissionsCharts } from "./AdmissionsCharts";

/**
 * Admissions 3 — the front desk funnel (docs/BUILD-PHASES.md Phase 1).
 * Admin/principal/counter see the board; RLS grants the desk roles the
 * writes. The conversion mints admission numbers and auto-links siblings
 * by parent phone — the family is captured ONCE (FEE-REALITY-CHECK).
 */
export default async function AdmissionsPage() {
  const me = await requireSession();
  if (me.principal.kind !== "staff" || !["admin", "principal", "counter"].includes(me.principal.role ?? "")) {
    redirect("/app");
  }
  const boot = await requireBootstrap();
  const [adm, cur, ana] = await Promise.all([getAdmissions(), getCurriculumSetup(), getAdmissionsAnalytics()]);
  if ("error" in adm) {
    return (
      <>
        <SerifHeader crumb={`${boot.school.name} / People`} title="Admissions" />
        <p className="mt-6 text-[13px] text-ink-500">{adm.error}</p>
      </>
    );
  }

  const open = adm.rows.filter((r) => r.stage !== "enrolled" && r.stage !== "lost");
  const enrolled = adm.rows.filter((r) => r.stage === "enrolled");
  const thisMonth = enrolled.filter((r) => r.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const followups = adm.rows.filter(
    (r) => r.next_followup_on && r.stage !== "enrolled" && r.stage !== "lost" && r.next_followup_on <= new Date().toISOString().slice(0, 10),
  );

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / People`}
        title="Admissions"
        sub="From first phone call to registered learner — one funnel, one audited enrolment."
        actions={<AppLiveBar />}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Open inquiries" value={open.length} note="families in the funnel" />
        <KpiCard label="Enrolled all-time" value={enrolled.length} tone="ok" />
        <KpiCard
          ink
          label="Inquiry to enrolment"
          value={`${"ok" in ana && ana.ok ? ana.conversion : 0}%`}
          note="conversion, all-time"
        />
        <KpiCard label="Follow-ups due" value={followups.length} tone={followups.length > 0 ? "warn" : "neutral"} note="call them today" />
      </div>

      {"ok" in ana && ana.ok ? (
        <div className="mt-6">
          <AdmissionsCharts data={ana} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
        <FunnelBoard
          rows={adm.rows}
          classes={"error" in cur ? [] : cur.classes.map((c) => ({ id: c.id, name: c.name }))}
        />
        {/* Phase 3: walk-in admission — learner + guardian + family link code + welcome WhatsApp in one audited step. */}
        {["admin", "principal"].includes(me.principal.role ?? "") ? <DirectAdmissionForm classes={"error" in cur ? [] : cur.classes.map((c) => ({ id: c.id, name: c.name }))} /> : null}
        <NewInquiryForm packs={"error" in cur ? [] : cur.packs.filter((p) => p.enabled).map((p) => ({ code: p.code, name: p.name }))} />
      </div>
    </>
  );
}
