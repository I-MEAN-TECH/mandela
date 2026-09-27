import { requireSession, requireBootstrap, getStaffDirectory, getClasses } from "@/lib/api";
import { ArrowRight, UsersRound, GraduationCap, ShieldCheck, IdCard } from "lucide-react";
import { Card, CardHead, KpiCard, DataTable, StatusPill, EmptyState, SerifHeader, CountUp } from "@mandela/ui";
import { AddStaffForm, StaffRowActions } from "../StaffRegister";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * People › Staff Register — its own screen: the headcount vitals up top,
 * the register table, the audit-logged add form. Admin/principal only.
 */
export default async function StaffRegisterPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const role = me.principal.role;
  if (!(role === "admin" || role === "principal")) redirect("/app/people");

  const [staff, classes] = await Promise.all([getStaffDirectory(), getClasses()]);
  const rows = staff.staff;
  const active = rows.filter((s) => s.active).length;
  const principalsActive = rows.filter((s) => s.role === "principal" && s.active).length;

  return (
    <div>
      <SerifHeader
        crumb="People / Staff Register"
        title={<>The register, alive.</>}
        sub="Every staff member on the books — contacts, licences and status, straight from the database. Writes are audit-logged."
        actions={
          <Link href="/app/people" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
            People overview
            <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
          </Link>
        }
      />

      <div className="mt-s7 grid gap-s3h">
        {/* Vitals */}
        <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
          <KpiCard icon={<UsersRound size={20} strokeWidth={1.75} aria-hidden />} delta={{ text: `${rows.length - active} inactive`, tone: rows.length - active > 0 ? "warn" : "neutral" }} value={<CountUp value={active} />} label="Active staff" />
          <KpiCard icon={<GraduationCap size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={rows.filter((s) => s.role === "teacher").length} />} label="Teachers" note="classroom staff" />
          <KpiCard icon={<ShieldCheck size={20} strokeWidth={1.75} aria-hidden />} value={<CountUp value={rows.filter((s) => ["admin", "principal"].includes(s.role)).length} />} label="Leadership" note="admin + principal" />
          <KpiCard icon={<IdCard size={20} strokeWidth={1.75} aria-hidden />} delta={{ text: rows.filter((s) => s.active && !s.national_id).length > 0 ? "fix below" : "all clear", tone: rows.filter((s) => s.active && !s.national_id).length > 0 ? "warn" : "ok" }} value={<CountUp value={rows.filter((s) => s.active && s.national_id).length} />} label="National ID on file" note={`of ${active} active`} />
        </div>

        {/* The register */}
        <Card>
          <CardHead title="Staff Register" sub={`${rows.length} staff · ${active} active`} />
          {rows.length === 0 ? (
            <EmptyState title="No staff yet" body="Add your first staff member below." />
          ) : (
            <DataTable
              columns={[
                { key: "name", title: "Name" },
                { key: "role", title: "Role" },
                { key: "contacts", title: "Contacts" },
                { key: "register", title: "TSC / ID" },
                { key: "classes", title: "Classes" },
                { key: "status", title: "Status" },
                { key: "actions", title: "" },
              ]}
              rows={rows.map((s) => ({
                name: <span className="font-semibold">{s.full_name}</span>,
                role: <StatusPill tone={s.active ? "ok" : "neutral"}>{s.role}</StatusPill>,
                contacts: (
                  <span className="text-xs text-muted">
                    {s.email}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </span>
                ),
                register: (
                  <span className="font-mono text-xs text-muted">
                    {s.tsc_no ?? "—"}
                    {" / "}
                    {s.national_id ?? "—"}
                  </span>
                ),
                classes: <span className="text-xs">{s.classes ?? "—"}</span>,
                status: <StatusPill tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "inactive"}</StatusPill>,
                actions: (
                  <StaffRowActions
                    id={s.id}
                    active={s.active}
                    role={s.role}
                    isLastPrincipal={s.role === "principal" && principalsActive <= 1}
                  />
                ),
              }))}
            />
          )}
        </Card>

        {/* The form */}
        <Card>
          <CardHead title="Add staff" sub="New staff appear in the register instantly — the write is audit-logged" />
          <AddStaffForm classCodes={classes.classes.map((c) => ({ code: c.code, name: c.name }))} />
        </Card>
      </div>
    </div>
  );
}

