import { requireSession, requireBootstrap, getExamCoverage, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { TwinLinks } from "@/components/TwinLinks";
import { AppLiveBar } from "../../LiveBar";
import { ApprovalQueue, CardDesk, CoverageMeters, GenerateCard } from "./ExamsClient";

/**
 * Exams & Report Cards 18 (docs/BUILD-PHASES.md Phase 2) — coverage +
 * approval + output. Capture is teacher-side; this screen answers the
 * admin's questions: who hasn't been assessed, what awaits approval, and
 * generate the card parents feel most. Teachers run the same desk scoped
 * to the classes on their timetable — they draft and manage; leadership
 * approves.
 */
export default async function ExamsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  // 028 IA: Exam Entries shares this door — HR/registry staff get the
  // readiness lists but not the approval/generate desks.
  if (["counter", "driver"].includes(me.principal.role ?? "")) redirect("/app");

  const [cov, learners] = await Promise.all([getExamCoverage(), getLearners()]);
  if ("error" in cov) redirect("/app/academics");

  // The teacher's desk is scoped to their taught classes (mirrors the API's
  // scoping); leadership sees every active learner.
  const isTeacher = me.principal.role === "teacher";
  const scopedNames = new Set(cov.classes.map((c) => c.class_name));
  const learnerList = learners.learners
    .filter((l) => l.status === "active")
    .filter((l) => !isTeacher || (l.class !== null && scopedNames.has(l.class)))
    .map((l) => ({ id: l.id, name: l.name, admissionNo: l.admission_no, cls: l.class }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Academics`}
        title={<>Exams & report cards.</>}
        sub={isTeacher
          ? "Your classes — capture the marks, draft the cards, and hand parents the document they came for. Leadership approves before a card leaves the building."
          : "Capture happens in class; here you watch coverage, approve the cards, and hand parents the document they came for — in each curriculum's own words."}
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <TwinLinks
          label="Exams"
          twins={[
            { href: "/app/academics/exams", label: "Coverage & cards" },
            { href: "/app/people/exam-entries", label: "KEMIS entries" },
          ]}
        />
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Capture coverage" value={`${cov.overallPct}%`} note="learners with records this term" />
          <KpiCard label="Classes" value={cov.classes.length} note="per-class meters below" />
          <KpiCard label="Pending approvals" value={cov.pendingApprovals.length} note="draft cards waiting" />
        </div>

        <div className="grid gap-s3h xl:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-s3h">
            <CoverageMeters classes={cov.classes} overall={cov.overallPct} />
            <ApprovalQueue pending={cov.pendingApprovals} canApprove={me.principal.role === "admin" || me.principal.role === "principal"} />
            <CardDesk cards={cov.recentCards ?? []} />
          </div>
          <GenerateCard learners={learnerList} />
        </div>
      </div>
    </div>
  );
}
