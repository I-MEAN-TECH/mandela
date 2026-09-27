import { requireSession, requireBootstrap, getStaffDirectory } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, KpiCard, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../LiveBar";

const roleTone: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  admin: "danger",
  principal: "warn",
  bursar: "ok",
  teacher: "neutral",
  counter: "neutral",
  driver: "neutral",
};

/** Directory — the staff side of People: who runs the school. */
export default async function DirectoryPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const { staff } = await getStaffDirectory();

  const active = staff.filter((s) => s.active).length;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / People`}
        title={<>Who runs the school.</>}
        sub="Every staff member, their role and classes — the school's own staff directory."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard ink label="Active staff" value={active} note={`of ${staff.length} on the register`} />
          <KpiCard label="Teachers" value={staff.filter((s) => s.role === "teacher").length} note="in the classroom" />
          <KpiCard label="Admin & leadership" value={staff.filter((s) => ["admin", "principal"].includes(s.role)).length} note="running the term" />
        </div>

        <Card>
          <CardHead title="Staff" sub={`${staff.length} on the register`} />
          {staff.length === 0 ? (
            <EmptyState title="No staff yet" body="Staff appear here as the school office adds them." />
          ) : (
            <DataTable
              columns={[
                { key: "name", title: "Name" },
                { key: "role", title: "Role" },
                { key: "classes", title: "Classes" },
                { key: "contact", title: "Contact" },
                { key: "state", title: "State" },
              ]}
              rows={staff.map((s) => ({
                name: s.full_name,
                role: <StatusPill tone={roleTone[s.role] ?? "neutral"}>{s.role}</StatusPill>,
                classes: s.classes ?? "—",
                contact: s.email ?? s.phone ?? "—",
                state: s.active ? <StatusPill tone="ok">active</StatusPill> : <StatusPill tone="neutral">inactive</StatusPill>,
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
