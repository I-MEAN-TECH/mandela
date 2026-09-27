import { requireSession, requireBootstrap, getPocketWallets, getLaundryCustody } from "@/lib/api";
import { KpiCard, SerifHeader, Money } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { PocketClient } from "./PocketClient";
import { LaundryClient } from "./LaundryClient";

/**
 * Pocket money (boarding flank) — per-learner wallets the counter runs like
 * a bank till: top-ups in, purchases out, running balance, everything audited.
 */
export default async function PocketPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "bursar", "counter"].includes(me.principal.role ?? "")) redirect("/app");

  const p = await getPocketWallets();
  const l = await getLaundryCustody();
  const wallets = p && "wallets" in p ? p.wallets : [];
  const laundry = l && "rows" in l ? l.rows : [];
  const total = wallets.reduce((a, x) => a + Number(x.balance_cents), 0);
  const boarders = wallets.filter((x) => x.boarding);
  const outNow = laundry.filter((x) => x.out_at).length;

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Money`}
        title="Pocket money"
        sub="Learner wallets run at the counter — honest balances, audited movements."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Held for learners" value={<Money cents={total} />} note="a liability, not income" />
        <KpiCard label="Wallets" value={wallets.length} />
        <KpiCard label="Boarders" value={boarders.length} note="weekly spenders" />
        <KpiCard label="Day scholars" value={wallets.length - boarders.length} />
      </div>

      <div className="mt-6">
        <PocketClient wallets={wallets} />
      </div>

      <div className="mt-6">
        <LaundryClient rows={laundry} boarders={boarders.map((w) => ({ id: w.learner_id, name: w.learner }))} outNow={outNow} />
      </div>
    </>
  );
}
