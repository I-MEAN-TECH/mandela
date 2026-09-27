"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money } from "@mandela/ui";
import { recordPocketTxnAction, type PocketWallet } from "@/lib/api";

export function PocketClient({ wallets }: { wallets: PocketWallet[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");

  const shown = wallets.filter((w) => w.learner.toLowerCase().includes(query.toLowerCase()));

  function txn(w: PocketWallet, direction: "topup" | "spend") {
    const amount = window.prompt(`${direction === "topup" ? "Top-up" : "Purchase"} amount (Ksh) for ${w.learner}`, "500");
    if (amount === null) return;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    const note = window.prompt("Note (what for / from whom)", direction === "topup" ? "Parent top-up" : "Tuck shop") ?? "";
    start(async () => {
      const r = await recordPocketTxnAction({ learnerId: w.learner_id, direction, amountCents: cents, note: note || null });
      setMsg(r.ok ? { ok: true, text: `${w.learner}: ${direction === "topup" ? "+" : "-"}Ksh ${(cents / 100).toLocaleString()}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Wallets"
        sub="Search by name · every movement is audited"
        action={
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
            className="h-9 w-44 rounded-pill border border-paper-300 bg-surface px-3.5 text-[13px] outline-none focus:border-primary" />
        }
      />
      <div className="flex max-h-[460px] flex-col divide-y divide-paper-200 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No wallets match.</p>
        ) : shown.map((w) => (
          <div key={w.learner_id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-[170px] flex-1">
              <p className="text-[13px] font-semibold text-ink-950">{w.learner}{w.boarding ? <span className="ml-1.5 font-mono text-[10px] uppercase text-primary">boarder</span> : null}</p>
              <p className="text-[11.5px] text-muted">{w.class_name ?? "—"}</p>
            </div>
            <p className="w-28 text-right font-mono text-[13.5px] font-bold text-ink-950"><Money cents={w.balance_cents} /></p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => txn(w, "topup")}>Top up</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => txn(w, "spend")}>Spend</Button>
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className={`border-t border-paper-200 px-4 py-2.5 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p> : null}
    </Card>
  );
}
