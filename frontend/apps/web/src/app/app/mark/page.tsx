import { requireSession, requireBootstrap, getClasses, getRoster, markAttendanceAction } from "@/lib/api";
import { Card, CardHead, EmptyState, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { MarkButtons } from "./MarkButtons";

/** Mark — comp language: serif header, roster rows, two taps per learner. */
export default async function MarkPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const classes = await getClasses();
  const first = classes.classes[0];
  const roster = first ? (await getRoster(first.id)).roster : [];

  return (
    <div>
      <SerifHeader
        crumb="Classroom / Today"
        title={<>Who's here, who's not.</>}
        sub="Two taps per learner — the roster and today's marks come straight from the school database."
      />

      <div className="mt-s7 grid gap-s3h">
        {!first ? (
          <Card>
            <EmptyState
              title="No classes yet"
              body="Classes appear here once the school office adds them."
            />
          </Card>
        ) : (
          <Card>
            <CardHead title={first.name} sub={`${first.learners} ${noun(Number(first.learners), "learner")} · ${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}`} />
            <MarkButtons roster={roster} action={markAttendanceAction} />
          </Card>
        )}
      </div>
    </div>
  );
}
