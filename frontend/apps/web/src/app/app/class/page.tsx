import { requireSession, requireBootstrap, getClasses, getRoster, getLearningAreas, getAssessments, getMySectionFull } from "@/lib/api";
import { Card, CardHead, EmptyState, KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../LiveBar";
import { AssessmentCapture } from "./AssessmentCapture";
import { MySectionTab } from "./MySectionTab";

/** Class — the teacher's own class today: roster + marks at a glance. */
export default async function ClassPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const classes = await getClasses();
  const first = classes.classes[0];
  const roster = first ? (await getRoster(first.id)).roster : [];
  const [areas, assessments, section] = first
    ? await Promise.all([getLearningAreas(first.id), getAssessments(first.id), getMySectionFull()])
    : [{ areas: [] }, { assessments: [] }, null];
  // 43a: the patron tab appears only for staff who head a section.
  const mySection = section && !("error" in section) && section && "sections" in section && section.sections.length > 0 ? section : null;

  const present = roster.filter((r) => r.mark === "present").length;
  const absent = roster.filter((r) => r.mark === "absent").length;
  const late = roster.filter((r) => r.mark === "late").length;
  const unmarked = roster.filter((r) => !r.mark).length;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Classroom`}
        title={<>My class, right now.</>}
        sub={first ? `${first.name} — today's register, straight from the DB.` : "Your class appears here once the office assigns you one."}
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard ink label="Roll call" value={roster.length} note={first?.name ?? "no class"} />
          <KpiCard label="Present" tone="ok" value={present} note="marked present today" />
          <KpiCard label="Absent" tone="danger" value={absent} note={late ? `${late} late` : "no lates"} />
          <KpiCard label="Unmarked" value={unmarked} note={unmarked > 0 ? "waiting for you" : "register complete — done"} />
        </div>

        <Card>
          <CardHead
            title={first?.name ?? "Roster"}
            sub={first ? `${first.learners} ${noun(Number(first.learners), "learner")} · ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}` : undefined}
          />
          {roster.length === 0 ? (
            <EmptyState title="No learners yet" body="Enrol learners into this class and they appear here instantly." />
          ) : (
            <div>
              {roster.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{r.name}</p>
                    <p className="font-mono text-[11.5px] text-muted">{r.admission_no}</p>
                  </div>
                  {r.mark ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold capitalize ${
                        r.mark === "present" ? "bg-ok-bg text-ok" : r.mark === "absent" ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn"
                      }`}
                    >
                      {r.mark}
                    </span>
                  ) : (
                    <span className="rounded-pill bg-paper-100 px-2.5 py-1 text-xs font-semibold text-muted">not marked</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {mySection ? (
          <div>
            <p className="mb-s3 font-display text-[16px] font-semibold text-ink-950">My section · patron duties</p>
            <MySectionTab data={mySection} />
          </div>
        ) : null}

        <Card>
          <CardHead
            title="Assessment"
            sub="CBC day-to-day recording — pick a learning area, tap a level per learner"
          />
          {roster.length === 0 ? (
            <EmptyState title="Nothing to assess yet" body="Learners appear here once the class has a roster." />
          ) : (
            <AssessmentCapture
              classId={first!.id}
              className={first!.name}
              learners={learnersFromRoster(roster)}
              areas={areas.areas}
              existing={assessments.assessments}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Roster rows carry admission numbers; assessment needs learner ids. */
function learnersFromRoster(roster: { id: string; name: string; admission_no: string; mark: string | null }[]) {
  return roster.map((r) => ({
    id: r.id,
    admission_no: r.admission_no,
    name: r.name,
    class: null,
    status: "active",
    gender: null,
  }));
}
