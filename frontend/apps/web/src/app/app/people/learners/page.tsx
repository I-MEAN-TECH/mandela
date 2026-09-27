import { requireSession, requireBootstrap, getLearners, getClasses } from "@/lib/api";
import { ArrowRight, GraduationCap, Venus, Mars, DoorOpen } from "lucide-react";
import { Card, CardHead, KpiCard, EmptyState, SerifHeader, CountUp } from "@mandela/ui";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ImportClient } from "./ImportClient";
import { LearnerRoster } from "./LearnerActions";

/**
 * People › Learners — its own screen: roll call vitals, the roster, the
 * classes they sit in. Read path for all staff; RLS scopes rows by role.
 */
export default async function LearnersPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const [learners, classes] = await Promise.all([getLearners(), getClasses()]);
  const rows = learners.learners;
  const active = rows.filter((l) => l.status === "active");
  const canEdit = me.principal.role === "admin" || me.principal.role === "principal";
  const girls = active.filter((l) => l.gender === "F").length;
  const boys = active.filter((l) => l.gender === "M").length;

  return (
    <div>
      <SerifHeader
        crumb="People / Learners"
        title={<>Every learner, on one roll.</>}
        sub="Admission numbers, classes and status — the school's roll, live from the database."
        actions={
          <Link href="/app/people" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            People overview
            <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
          </Link>
        }
      />

      <div className="mt-s7 grid gap-s3h">
        {/* Roll vitals */}
        <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
          <KpiCard icon={<GraduationCap size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={active.length} />} label="On roll" note={`${rows.length - active.length} inactive`} />
          <KpiCard icon={<Venus size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={girls} />} label="Girls" note={active.length ? `${Math.round((girls / active.length) * 100)}% of the roll` : undefined} />
          <KpiCard icon={<Mars size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={boys} />} label="Boys" note={active.length ? `${Math.round((boys / active.length) * 100)}% of the roll` : undefined} />
          <KpiCard icon={<DoorOpen size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={classes.classes.length} />} label="Classes" note={`${classes.classes.reduce((s, c) => s + (Number(c.learners) || 0), 0)} seats filled`} />
        </div>

        <div className="grid gap-s3h xl:grid-cols-[1fr_340px]">
          {/* The roster — search, filter, edit, status: the roll you can actually work */}
          <LearnerRoster rows={rows} classes={classes.classes} canEdit={canEdit} />

          {/* Classes side card */}
          <Card>
            <CardHead title="Classes" sub={`${classes.classes.length} running`} />
            {classes.classes.length === 0 ? (
              <EmptyState title="No classes yet" body="Add classes to start enrolling learners." />
            ) : (
              <ul className="grid gap-s2.5">
                {classes.classes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-paper-200 bg-paper-50 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink-950">{c.name}</span>
                      <span className="block font-mono text-[11px] text-muted">{c.code}</span>
                    </span>
                    <span className="numeral shrink-0 text-[13px] font-semibold text-pine-700">{c.learners}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* 360 + bulk import */}
        <ImportClient />
      </div>
    </div>
  );
}

