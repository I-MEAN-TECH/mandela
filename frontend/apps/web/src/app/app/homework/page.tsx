import { requireSession, requireBootstrap, getHomework, getClasses, createHomeworkAction } from "@/lib/api";
import { Card, CardHead, EmptyState, SerifHeader } from "@mandela/ui";
import { HomeworkForm } from "./HomeworkForm";

/** Homework — the anti-LMS: a light list + one form. All rows from the DB. */
export default async function HomeworkPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") return <GuardianHomeworkNotice />;
  const [homework, classes] = await Promise.all([getHomework(), getClasses()]);

  return (
    <div>
      <SerifHeader
        crumb="Classroom / Homework"
        title={<>Set it once, everyone knows.</>}
        sub="Homework reaches the class's guardians on WhatsApp the moment you set it."
      />

      <div className="mt-s7 grid gap-s3h">
        <Card>
          <CardHead title="Set homework" sub="Class, subject, title, instructions — that's the whole form" />
          <HomeworkForm classes={classes.classes} action={createHomeworkAction} />
        </Card>

        <Card>
          <CardHead title="Recent" sub="Newest first" />
          {homework.homework.length === 0 ? (
            <EmptyState title="Nothing set yet" body="Homework you set appears here and reaches parents on WhatsApp." />
          ) : (
            <div>
              {homework.homework.map((h) => (
                <div key={h.id} className="border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-semibold">
                      {h.subject}: {h.title}
                    </p>
                    <span className="font-mono text-[11.5px] text-muted">
                      {h.due_on ? `due ${h.due_on}` : "no due date"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{h.body}</p>
                  <p className="mt-1 text-xs text-muted">{h.class}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function GuardianHomeworkNotice() {
  return (
    <div>
      <SerifHeader crumb="Classroom / Homework" title={<>What's due.</>} />
      <div className="mt-s7">
        <EmptyState
          title="Parents see homework on the mobile app"
          body="Your child's homework appears in the Mandela parent app and on WhatsApp."
        />
      </div>
    </div>
  );
}
