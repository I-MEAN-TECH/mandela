import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { requireSession, requireBootstrap } from "@/lib/api";
import { SerifHeader } from "@mandela/ui";

/**
 * Academics tab root — now a real hub: the group grew to three children
 * (Curriculum Setup 16, Attendance Oversight 17, Exams & Report Cards 18).
 * Same door pattern as the People hub: pick your door, each opens its own
 * screen with its own cards/forms/charts.
 */

const MODULES = [
  {
    href: "/app/academics/curriculum",
    title: "Curriculum Setup",
    desc: "The school's switches — enable curriculum packs, place classes on the ladder, and see exactly how forms adapt per curriculum.",
  },
  {
    href: "/app/academics/timetable",
    title: "Timetable",
    desc: "The Mon–Fri grid, class by class — areas, teachers, rooms; teacher clashes refused by name.",
  },
  {
    href: "/app/academics/attendance",
    title: "Attendance Oversight",
    desc: "The school-wide view — today %, the 7-day trend, chronic absentees worth a phone call, per-class compare. Read-only; marking stays with teachers.",
  },
  {
    href: "/app/academics/exams",
    title: "Exams, Entries & Report Cards",
    desc: "Capture coverage, KEMIS readiness, the approval queue, and report cards rendered in each curriculum's own words.",
  },
  {
    href: "/app/operations/library",
    title: "Library",
    desc: "Counter issue/return two taps, overdue chase list, most-borrowed — fines are levies, never desk cash.",
  },
];

export default async function AcademicsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Academics`}
        title={<>Learning, overseen.</>}
        sub="How the school teaches, whether learners show up, and what parents take home — the whole academic engine behind one door."
      />
      <div className="mt-s7 grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="group rounded-card border border-paper-200 bg-surface p-s4 transition-colors hover:bg-paper-50">
            <p className="text-[16px] font-semibold text-ink-950">{m.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{m.desc}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-pine-700">
              Open <ArrowRight aria-hidden size={14} strokeWidth={2} className="transition-transform group-hover:translate-x-0.5" />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
