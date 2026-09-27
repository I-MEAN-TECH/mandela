import { requireSession, requireBootstrap, getSections, getStaffDirectory } from "@/lib/api";
import { KpiCard, SerifHeader, Money } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { SectionsClient } from "./SectionsClient";

/**
 * Sections & Patrons (docs/BUILD-PHASES.md Phase 2) — the §0.6 lattice
 * made real: one generic engine, sections as rows. The principal
 * appoints patrons; every section gets the same four capabilities
 * (Kit · Money levies · Events · Register). Admin/principal manage;
 * the patron gets the focused My Section view.
 */
export default async function SectionsPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const [sections, staff] = await Promise.all([getSections(), getStaffDirectory()]);
  const rows = "rows" in sections ? sections.rows : [];
  const staffRows = "staff" in staff ? staff.staff : [];

  const enabled = rows.filter((r) => r.enabled).length;
  const noPatron = rows.filter((r) => r.enabled && !r.head_staff_id).length;
  const members = rows.reduce((a, r) => a + Number(r.members), 0);
  const kitValue = rows.reduce((a, r) => a + Number(r.kit_value_cents), 0);

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Sections"
        title="Sections & Patrons"
        sub="One engine for every non-classroom corner of the school — lab, sports, drama, mess, security, infirmary, houses. The principal appoints a patron; the patron runs their section."
      />

      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sections enabled" value={enabled} note={`${rows.length} total`} />
        <KpiCard
          label="Patrons appointed"
          value={rows.filter((r) => r.head_staff_id).length}
          note={noPatron > 0 ? `${noPatron} section${noPatron > 1 ? "s" : ""} without a patron` : "Every section covered"}
          tone={noPatron > 0 ? "warn" : "ok"}
        />
        <KpiCard label="Members across sections" value={members} note="A learner may wear many hats" />
        <KpiCard label="Kit value tagged" value={<Money cents={kitValue} />} note="Equipment & consumables" />
      </div>

      <SectionsClient rows={rows} staff={staffRows} canManage />
    </div>
  );
}
