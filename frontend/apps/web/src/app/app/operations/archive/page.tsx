import { requireSession, requireBootstrap, getAssetArchive } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { ArchiveClient } from "./ArchiveClient";

function fmtMoney(cents: number): string {
  return "KSh " + (cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

/**
 * Asset Archive — the school-wide accession register: library books with
 * barcodes, lab equipment, dorm fit-out, classroom and office furniture.
 * Scan-to-input with any USB/Bluetooth barcode scanner (it types + Enter),
 * per-department tabs, totals per department for the BOM/reports.
 */
export default async function AssetArchivePage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const data = await getAssetArchive();
  if ("error" in data) {
    return (
      <div className="flex flex-col gap-s6">
        <AppLiveBar />
        <SerifHeader crumb="Operations / Asset Archive" title="Asset Archive" />
        <p className="text-[13px] text-danger">Could not load the register — is the API up?</p>
      </div>
    );
  }

  const canEdit = ["admin", "principal", "teacher", "bursar", "counter"].includes(me.principal.role ?? "");
  const canDelete = me.principal.role === "admin" || me.principal.role === "principal";
  const totalUnits = data.totals.reduce((a, t) => a + t.units, 0);
  const totalValue = data.totals.reduce((a, t) => a + Number(t.value_cents), 0);
  const totalDamaged = data.totals.reduce((a, t) => a + t.damaged, 0);
  const lib = data.totals.find((t) => t.department === "library");

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Asset Archive"
        title="Everything the school owns, numbered and findable."
        sub="The accession register for the whole school: scan a barcode to record or update a unit — books, lab gear, dorm fit-out, desks and chairs. New purchases are entered the day they arrive."
      />
      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Units recorded" value={totalUnits} note={`${data.rows.length} register entries`} />
        <KpiCard label="Record value" value={fmtMoney(totalValue)} note="what the register paid for" />
        <KpiCard label="Library units" value={lib?.units ?? 0} note={lib ? fmtMoney(Number(lib.value_cents)) : "no books recorded yet"} />
        <KpiCard label="Worn · broken · lost" value={totalDamaged} tone={totalDamaged > 0 ? "warn" : "ok"} note="flagged for repair or replacement" />
      </div>
      <ArchiveClient data={data} canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}
