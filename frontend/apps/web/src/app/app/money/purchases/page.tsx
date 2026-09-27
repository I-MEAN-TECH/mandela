import { requireSession, requireBootstrap, getPurchasesOverview } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { PurchasesClient } from "./PurchasesClient";

/**
 * Purchases & Suppliers ㊳ (docs/BUILD-PHASES.md Phase 3) — the spending
 * side the owner runs: the supplier register and the purchase pipeline
 * draft → submitted → approved → ordered → received → paid, every step
 * audited. Roles: admin/bursar/principal.
 */
export default async function PurchasesPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "bursar", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  await requireBootstrap();

  const data = await getPurchasesOverview();
  if ("error" in data) {
    return (
      <div className="flex flex-col gap-s6">
        <AppLiveBar />
        <SerifHeader crumb="Money / Purchases" title="Purchases & Suppliers" />
        <p className="text-[13px] text-danger">Could not load purchases — is the API up?</p>
      </div>
    );
  }

  const canDecide = me.principal.role === "admin" || me.principal.role === "principal";
  const open = data.requests.filter((r) => ["draft", "submitted", "approved", "ordered"].includes(r.state));
  const activeSuppliers = data.suppliers.filter((s) => s.active).length;

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Money / Purchases & Suppliers"
        title="Every shilling out, on the record."
        sub="The supplier book and the purchase pipeline — nothing is ordered, received or paid without a step on the trail. This is the spreadsheet we replace."
      />

      <div className="grid gap-s4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open commitments" value={<Money cents={Number(data.openTotalCents)} />} note="draft → ordered, not yet paid" />
        <KpiCard label="Open requests" value={open.length} note={open.length ? "move them along below" : "pipeline clear"} tone={open.length ? "warn" : "ok"} />
        <KpiCard label="Active suppliers" value={activeSuppliers} note={`${data.suppliers.length} on the book`} />
        <KpiCard label="Awaiting approval" value={data.requests.filter((r) => r.state === "submitted").length} note="leaders sign these" tone={data.requests.some((r) => r.state === "submitted") ? "warn" : "ok"} />
      </div>

      <PurchasesClient data={data} canDecide={canDecide} />
    </div>
  );
}
