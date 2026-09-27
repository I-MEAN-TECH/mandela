import { requireSession, requireBootstrap, getLearners, getClasses, getStaffDirectory, getKemisReadiness, getGuardians } from "@/lib/api";
import { Card, CardHead, StatusPill, EmptyState, SerifHeader } from "@mandela/ui";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import Link from "next/link";

/**
 * People — the module hub. Each sub-module is its own screen now
 * (Staff Register, Learners, Guardians & Parents, Exam Entries); this
 * page gives each one a living summary card and hands off.
 */

const MODULES = [
  {
    href: "/app/people/staff",
    title: "Staff Register",
    desc: "The register of everyone employed — contacts, TSC/ID, status. Add staff, deactivate, keep the licence record whole.",
    icon: (
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    ),
  },
  {
    href: "/app/people/learners",
    title: "Learners",
    desc: "The roll — admission numbers, classes, gender, status. Every learner on one screen.",
    icon: <path d="M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5" />,
  },
  {
    href: "/app/people/admissions",
    title: "Admissions",
    desc: "The inquiry funnel — walk-ins become visits, assessments, offers, enrolments. Siblings auto-link by parent phone.",
    icon: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  },
  {
    href: "/app/people/guardians",
    title: "Guardians & Parents",
    desc: "The family contact book — phones, relationships, WhatsApp opt-ins, CSV import for enrolment week.",
    icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM19 8v6M22 11h-6" />,
  },
  {
    href: "/app/people/exam-entries",
    title: "Exam Entries",
    desc: "KEMIS readiness — UPI, birth-cert entry numbers, DOB. The gap-list that stands between a learner and their exam.",
    icon: <path d="M9 12h6M9 16h6M9 8h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />,
  },

  {
    href: '/app/people/hr',
    title: 'HR & Leave',
    desc: 'The leave ledger — who is out today, what waits on a decision, days taken against entitlement. Reasons mandatory, everything audited.',
    icon: <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' />,
  },
];

export default async function PeoplePage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const role = me.principal.role;
  const canManageStaff = role === "admin" || role === "principal";

  const [learners, classes, staff, kemis, guardians] = await Promise.all([
    getLearners(),
    getClasses(),
    canManageStaff ? getStaffDirectory() : Promise.resolve({ staff: [] }),
    canManageStaff ? getKemisReadiness() : Promise.resolve(null),
    canManageStaff ? getGuardians() : Promise.resolve(null),
  ]);

  const activeStaff = staff.staff.filter((s) => s.active).length;
  const activeLearners = learners.learners.filter((l) => l.status === "active").length;
  const upiPct =
    kemis && !("error" in kemis) && kemis.learners.total > 0
      ? Math.round((kemis.learners.with_upi / kemis.learners.total) * 100)
      : null;

  return (
    <div>
      <SerifHeader
        crumb="People / Register"
        title={<>Everyone, in one place.</>}
        sub="Five registers make up the school's people. Each opens into its own screen — pick your door."
      />

      <div className="mt-s7 grid gap-s3h sm:grid-cols-2">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="group">
            <Card className="h-full !p-s5 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1 motion-reduce:transition-none">
              <span className="grid h-11 w-11 place-items-center rounded-sm bg-paper-100 text-pine-700">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {m.icon}
                </svg>
              </span>
              <h2 className="mt-s3 font-display text-[17px] font-semibold text-ink-950">{m.title}</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{m.desc}</p>
              <span className="mt-s3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-pine-700">
                Open
                <ArrowRight aria-hidden size={14} strokeWidth={2} className="transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-1 motion-reduce:transition-none" />
              </span>
            </Card>
          </Link>
        ))}

        {/* The living summaries — each card above gets real numbers below */}
        {canManageStaff ? (
          <Card className="sm:col-span-2">
            <CardHead title="At a glance" sub="Live counts across the registers" />
            <div className="grid gap-s3 sm:grid-cols-4">
              <Glance label="Staff active" value={activeStaff} href="/app/people/staff" />
              <Glance label="Learners on roll" value={activeLearners} href="/app/people/learners" />
              <Glance
                label="Guardians on file"
                value={guardians && !("error" in guardians) ? Number(guardians.stats.total) : 0}
                href="/app/people/guardians"
              />
              <Glance label="UPI assigned" value={upiPct === null ? "—" : `${upiPct}%`} href="/app/people/exam-entries" />
            </div>
          </Card>
        ) : null}

        {/* Classes remain a People-level concern */}
        <Card className="sm:col-span-2">
          <CardHead title="Classes" sub={`${classes.classes.length} ${noun(classes.classes.length, "class", "classes")} this term`} />
          {classes.classes.length === 0 ? (
            <EmptyState title="No classes yet" body="Add classes to start enrolling learners." />
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {classes.classes.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-2 rounded-sm border border-paper-200 bg-paper-50 px-3.5 py-2 text-[12.5px]">
                  <span className="font-semibold text-ink-950">{c.name}</span>
                  <span className="font-mono text-[11px] text-muted">{c.code}</span>
                  <span className="numeral font-semibold text-pine-700">{c.learners}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Glance({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link href={href} className="rounded-sm border border-paper-200 bg-paper-50 p-4 transition-colors hover:bg-paper-100">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="numeral mt-1.5 text-xl font-semibold text-ink-950">{value}</p>
    </Link>
  );
}
