import { requireSession, requireBootstrap } from "@/lib/api";
import { ArrowRight } from "lucide-react";
import { SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppLiveBar } from "../LiveBar";

/**
 * Operations hub — the non-academic engine's front door. Modules appear
 * here as they land (Sections, Events now; Transport/Library/Store as
 * Phase 3 builds them).
 */
const DOORS = [
  {
    href: "/app/operations/sections",
    title: "Sections & Patrons",
    sub: "The §0.6 lattice: lab, sports, drama, mess, security, infirmary, houses — one engine, sections as rows, patrons appointed by the principal.",
  },
  {
    href: "/app/operations/events",
    title: "Events & Calendar",
    sub: "Fixtures, festivals, exam windows, open days — the term calendar that feeds guardian announcements.",
  },
  {
    href: "/app/operations/rosters",
    title: "Duty Rosters",
    sub: "Recurring assigned tasks by section and term — who covers what, every week, without a WhatsApp reminder.",
  },
  {
    href: "/app/operations/facilities",
    title: "Facilities & Repairs",
    sub: "Desks, lockers, dorms, windows — anyone reports in two taps; the repair-vs-replace verdict is the <50% rule.",
  },
  {
    href: "/app/operations/transport",
    title: "Transport",
    sub: "Routes with stops and term fees, buses, manifests, the AM/PM trip log the driver dashboard reads.",
  },
];

export default async function OperationsPage() {
  const session = await requireSession();
  if (!session) redirect("/login");
  await requireBootstrap();

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        
        title="The school beyond the classroom."
        sub="Transport, library, store, facilities — and the sections engine that carries them all."
      />
      <div className="grid gap-s4 md:grid-cols-2">
        {DOORS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="flex flex-col gap-s2 rounded-lg border border-border bg-surface p-s5 transition-colors hover:border-fg/30"
          >
            <span className="text-[15px] font-semibold text-text">{d.title}</span>
            <span className="text-sm text-muted">{d.sub}</span>
            <span className="pt-s2 text-xs font-semibold text-primary">Open<ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
