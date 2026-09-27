import { requireSession, requireBootstrap, getAttendanceOversight } from "@/lib/api";
import { Card, CardHead, KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { AttendanceTrend, ChronicList, ClassCompare } from "./AttendanceClient";

/**
 * Attendance Oversight 17 (docs/BUILD-PHASES.md Phase 2) — the admin's
 * school-wide view. Read-only by law: teacher marking writes the data daily;
 * correction stays with the teacher, edits audited. Roles: admin/principal.
 */
export default async function AttendanceOversightPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");

  const data = await getAttendanceOversight();
  if ("error" in data) redirect("/app/academics");

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Academics`}
        title={<>Attendance, school-wide.</>}
        sub="Teachers mark daily; you see the whole picture. Read-only here — corrections belong to the marker, and every edit is audited."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Present today" value={`${data.todayPct}%`} note={`${data.todayMarked} marks recorded`} />
          <KpiCard label="Chronic absentees" value={data.chronic.length} note="3+ absences in 30 days" />
          <KpiCard label="Classes tracked" value={data.byClass.length} note="7-day present-rate each" />
        </div>

        <div className="grid gap-s3h xl:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-s3h">
            <Card>
              <CardHead title="7-day trend" sub="School present-rate by day" />
              <AttendanceTrend trend={data.trend7} />
            </Card>
            <ChronicList chronic={data.chronic} />
          </div>
          <ClassCompare byClass={data.byClass} />
        </div>
      </div>
    </div>
  );
}
