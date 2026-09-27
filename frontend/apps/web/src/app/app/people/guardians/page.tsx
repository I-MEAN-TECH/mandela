import { requireSession, requireBootstrap, getGuardians } from "@/lib/api";
import { ArrowRight, Users, MessageCircle, Link2, MessageSquareOff } from "lucide-react";
import { KpiCard, SerifHeader, CountUp } from "@mandela/ui";
import { Guardians } from "../Guardians";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * People › Guardians & Parents — its own screen: the contact-book vitals,
 * then the full register with CSV import/export and the WhatsApp opt-in.
 */
export default async function GuardiansPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const role = me.principal.role;
  if (!(role === "admin" || role === "principal")) redirect("/app/people");

  const guardians = await getGuardians();
  const data = guardians && !("error" in guardians) ? guardians : null;
  const total = data ? Number(data.stats.total) : 0;
  const wa = data ? Number(data.stats.wa) : 0;
  const withChildren = data ? Number(data.stats.with_children) : 0;

  return (
    <div>
      <SerifHeader
        crumb="People / Guardians & Parents"
        title={<>Every family, reachable.</>}
        sub="Phone numbers, relationships and WhatsApp opt-ins — the contact book the Talk module messages through."
        actions={
          <Link href="/app/people" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            People overview
            <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
          </Link>
        }
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
          <KpiCard icon={<Users size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={total} />} label="Guardians on file" />
          <KpiCard
            icon={<MessageCircle size={20} strokeWidth={1.75} aria-hidden />}
            delta={{ text: total ? `${Math.round((wa / total) * 100)}% opted in` : "—", tone: "ok" }}
            value={<CountUp value={wa} />}
            label="On WhatsApp"
            note="reachable instantly, free"
          />
          <KpiCard icon={<Link2 size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={withChildren} />} label="Linked to children" note="via the family table" />
          <KpiCard icon={<MessageSquareOff size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={Math.max(total - wa, 0)} />} label="Not on WhatsApp" note="SMS fallback applies" />
        </div>

        {data ? (
          <Guardians initial={data} />
        ) : (
          <p className="text-[13px] text-muted">Could not load the guardian register. Try again shortly.</p>
        )}
      </div>
    </div>
  );
}

