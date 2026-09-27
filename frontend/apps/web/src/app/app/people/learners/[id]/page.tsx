import { requireSession, requireBootstrap, getLearner360, getClasses } from "@/lib/api";
import { LearnerStatusToggle } from "../LearnerActions";
import { GuardianRelationshipRow, LinkGuardianForm, ClassMoveForm } from "./Learner360Actions";
import { Card, CardHead, KpiCard, Money, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * Learner 360 (docs/MASTER-CHECKLIST.md ②) — one profile: identity,
 * guardians, the fee ledger (SAME math as Invoices ⑬), attendance
 * history, conduct summary and the sections they wear.
 */
export default async function Learner360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const data = await getLearner360(id);
  if (!data || "error" in data) {
    return (
      <div>
        <SerifHeader crumb="People / Learners" title={<>Learner not found.</>} sub="The record may have been withdrawn." />
        <p className="mt-s5 text-sm text-muted">
          <Link href="/app/people/learners" className="underline">Back to the roster</Link>
        </p>
      </div>
    );
  }
  const classes = await getClasses();

  const l = data.learner;
  const ledger = data.ledger;
  const att = data.attendance;

  return (
    <div className="flex flex-col gap-s6">
      <SerifHeader
        crumb="People / Learner 360"
        title={<>{l.name}</>}
        sub={`Adm ${l.admission_no}${l.upi ? ` · UPI ${l.upi}` : ""}${l.class_name ? ` · ${l.class_name}` : ""}${l.boarding ? " · boarder" : ""}`}
        actions={
          <Link href="/app/people/learners" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            Roster
          </Link>
        }
      />

      <div className="grid gap-s3h xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-s3h">
          <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
            <KpiCard
              label="Attendance rate"
              value={`${att.rate.toFixed(0)}%`}
              note={`${att.present} present · ${att.absent} absent · ${att.late} late`}
              tone={att.rate < 85 ? "warn" : "ok"}
            />
            <KpiCard label="Merits" value={data.conduct.merits} tone="ok" note="recorded" />
            <KpiCard label="Demerits" value={data.conduct.demerits} tone={data.conduct.demerits > 0 ? "danger" : "neutral"} note="recorded" />
            <KpiCard
              label="Fee balance"
              value={ledger ? <Money cents={ledger.balance_cents} /> : "—"}
              note={ledger ? `billed ${Number(ledger.billed_cents) / 100} · paid ${Number(ledger.paid_cents) / 100}` : "no term ledger yet"}
              tone={ledger && Number(ledger.balance_cents) > 0 ? "warn" : "ok"}
            />
          </div>

          <Card>
            <CardHead title="Guardians" sub="The family entity — siblings share these rows. Edit the relationship, set who is primary, or unlink." />
            {data.guardians.length === 0 ? (
              <p className="p-s5 text-sm text-muted">No guardian linked yet. Import or admissions auto-links by phone.</p>
            ) : (
              <div className="flex flex-col divide-y divide-paper-200 px-s5 pb-s4">
                {data.guardians.map((g) => (
                  <div key={g.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink-950">
                        {g.full_name}
                        {g.is_primary ? <span className="ml-s2 text-[11px] text-ok">primary</span> : null}
                      </span>
                      <span className="font-mono text-[12px] text-muted">{g.phone}</span>
                    </div>
                    {me.principal.role === "admin" || me.principal.role === "principal" ? (
                      <div className="mt-1">
                        <GuardianRelationshipRow
                          learnerId={id}
                          guardianId={g.id}
                          guardianName={g.full_name}
                          relationship={g.relationship ?? "guardian"}
                          isPrimary={Boolean(g.is_primary)}
                        />
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted">{g.relationship ?? "guardian"}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {me.principal.role === "admin" || me.principal.role === "principal" ? (
              <div className="border-t border-paper-200 px-s5 py-s4">
                <LinkGuardianForm learnerId={id} guardians={[]} />
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHead title="Sections" sub="Every hat the learner wears beyond the classroom." />
            {data.sections.length === 0 ? (
              <p className="p-s5 text-sm text-muted">Not in any section yet.</p>
            ) : (
              <div className="flex flex-wrap gap-s2 px-s5 pb-s4">
                {data.sections.map((s) => (
                  <StatusPill key={s.name} tone="neutral">{s.name} · {s.kind}</StatusPill>
                ))}
              </div>
            )}
          </Card>
        </div>          <Card>
            <CardHead title="Record" sub="Identity as data · hand the parent real paper" />
          <dl className="flex flex-col gap-s2 px-s5 pb-s5 text-sm">
            <Row k="Status" v={<StatusPill tone={l.status === "active" ? "ok" : "neutral"}>{l.status}</StatusPill>} />
            <Row k="Class" v={l.class_name ?? "—"} />
            <Row k="Gender" v={l.gender ?? "—"} />
            <Row k="Date of birth" v={l.dob ?? "—"} />
            <Row k="Boarding" v={l.boarding ? "Boarder" : "Day"} />
            <Row k="Admission no" v={<span className="font-mono text-xs">{l.admission_no}</span>} />
            <Row k="UPI" v={l.upi ? <span className="font-mono text-xs">{l.upi}</span> : <span className="text-warn">missing — blocks KEMIS entry</span>} />
          </dl>
          {me.principal.role === "admin" || me.principal.role === "principal" ? (
            <div className="border-t border-paper-200 px-s5 py-s4">
              <LearnerStatusToggle learnerId={id} name={l.name} status={l.status} />
            </div>
          ) : null}
          {me.principal.role === "admin" || me.principal.role === "principal" ? (
            <div className="border-t border-paper-200 px-s5 py-s4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Class moves · with history</p>
              <ClassMoveForm
                learnerId={id}
                classes={classes.classes.map((c) => ({ id: c.id, name: c.name }))}
                currentClassId={l.class_id ?? null}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-s2 border-t border-paper-200 px-s5 py-s4">
            <a
              href={`/print/report-card?learnerId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-pill border border-paper-300 px-4 text-[12.5px] font-semibold text-pine-700 hover:border-pine-300"
            >
              Report card (A4)
            </a>
            <a
              href={`/print/statement?learnerId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-pill border border-paper-300 px-4 text-[12.5px] font-semibold text-pine-700 hover:border-pine-300"
            >
              Fee statement (A4)
            </a>
            {/* C13 — server PDFs: real bytes for email/archive, same session law. */}
            <a
              href={`/api/pdf?kind=report-card&learnerId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-pill border border-paper-300 px-4 text-[12.5px] font-semibold text-pine-700 hover:border-pine-300"
            >
              Report card PDF
            </a>
            <a
              href={`/api/pdf?kind=statement&learnerId=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-pill border border-paper-300 px-4 text-[12.5px] font-semibold text-pine-700 hover:border-pine-300"
            >
              Statement PDF
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[12px] uppercase tracking-wide text-muted">{k}</dt>
      <dd className="text-[13.5px] text-ink-950">{v}</dd>
    </div>
  );
}
