import { requireSession, requireBootstrap, getAlumni, getLearners, markAlumniAction } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { AlumniClient } from "./AlumniClient";

/**
 * Alumni (flank #2) — the register of learners who have walked out the gate
 * for the last time: graduated year, final class, mentor availability.
 * Talk comms to alumni ride the normal announcement fanout.
 */
export default async function AlumniPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const [alumni, learners] = await Promise.all([getAlumni(), getLearners()]);
  const rows = alumni && "alumni" in alumni ? alumni.alumni : [];
  const mentors = rows.filter((r) => r.mentor_available).length;
  const roster = learners.learners
    .filter((l) => l.status === "active")
    .slice(0, 300)
    .map((l) => ({ id: l.id, name: `${l.name} · ${l.admission_no}` }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / People`}
        title={<>Those who went before.</>}
        sub="The alumni register — who graduated, who mentors, who stays reachable. Directory visibility is consent-gated."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-3">
          <KpiCard ink label="Alumni on register" value={rows.length} note="marked graduated" />
          <KpiCard label="Mentors available" value={mentors} note="give talks, host visits" />
          <KpiCard label="Graduation years" value={new Set(rows.map((r) => r.graduated_on.slice(0, 4))).size} note="distinct years" />
        </div>

        <Card>
          <CardHead title="Mark a learner graduated" sub="The learner leaves the active roll and joins this register" />
          {roster.length === 0 ? (
            <EmptyState title="No learners to mark" body="Alumni arrive from the active roll." />
          ) : (
            <AlumniClient learners={roster} action={markAlumniAction} />
          )}
        </Card>

        <Card>
          <CardHead title="Alumni register" sub={`${rows.length} on the register`} />
          {rows.length === 0 ? (
            <EmptyState title="No alumni yet" body="Mark a learner graduated and they appear here." />
          ) : (
            <DataTable
              columns={[
                { key: "name", title: "Alumnus" },
                { key: "adm", title: "Admission no" },
                { key: "graduated", title: "Graduated" },
                { key: "final", title: "Final class" },
                { key: "mentor", title: "Mentor" },
              ]}
              rows={rows.map((r) => ({
                name: <span className="font-semibold">{r.learner}</span>,
                adm: <span className="font-mono text-xs text-muted">{r.adm}</span>,
                graduated: r.graduated_on,
                final: r.final_class ?? "—",
                mentor: r.mentor_available ? "available" : "—",
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
