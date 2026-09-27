import { requireSession, requireBootstrap, getStore } from "@/lib/api";
import { KpiCard, Money, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { StoreClient } from "./StoreClient";

/**
 * Store ㉒ (docs/BUILD-PHASES.md Phase 2) — kit issuance, low-stock alerts
 * to the pulse, movement history. Items can be tagged to Sections (the Kit
 * capability) right here.
 */
export default async function StorePage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const data = await getStore();
  const items = "items" in data ? data.items : [];

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Operations / Store"
        title="Every item in, out, and on a shelf."
        sub="Stock adjustments write movement history; low stock feeds the pulse; uniform sales bill through fee items — the store never runs a parallel ledger."
      />
      <div className="grid gap-s4 sm:grid-cols-3">
        <KpiCard label="Items tracked" value={items.length} />
        <KpiCard label="Low stock" value={"low_count" in data ? data.low_count : 0} tone={"low_count" in data && data.low_count > 0 ? "warn" : "ok"} />
        <KpiCard label="Stock value" value={<Money cents={"stock_value_cents" in data ? data.stock_value_cents : 0} />} />
      </div>
      <StoreClient items={items} />
    </div>
  );
}
