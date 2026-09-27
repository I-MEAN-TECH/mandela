"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState, Money, StatusPill } from "@mandela/ui";
import { adjustStockAction, type StoreData } from "@/lib/api";

/** Store client — adjust stock (+/-) with a movement note. */
export function StoreClient({ items }: { items: StoreData["items"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [delta, setDelta] = useState(1);
  const [note, setNote] = useState("");

  const adjust = (itemId: string, d: number) => {
    start(async () => {
      const r = await adjustStockAction({ itemId, delta: d, note: note.trim() || null });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setOpenId(null); setNote(""); setMsg("Stock adjusted; movement recorded.");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHead
        title="Stock"
        sub="Toggle an item to adjust quantity — every movement is written to history and the audit trail."
      />
      {msg ? <p className="px-s5 pb-s2 text-sm text-ok">{msg}</p> : null}
      {items.length === 0 ? (
        <EmptyState title="No stock items yet" body="Add store items via the seed or fee structures; they appear here with live quantities." />
      ) : (
        <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-s2 py-2.5 text-sm">
              <span className="font-medium text-text">{i.name}</span>
              <StatusPill tone="neutral">{i.category}</StatusPill>
              {i.section_name ? <StatusPill tone="ok">kit: {i.section_name}</StatusPill> : null}
              <span className={i.low ? "text-warn" : "text-muted"}>×{i.qty_on_hand} {i.low ? "(low)" : ""}</span>
              <Money cents={i.unit_price} className="text-[12.5px]" />
              <button
                type="button"
                className="ml-auto text-xs text-muted hover:text-text"
                onClick={() => { setOpenId(openId === i.id ? null : i.id); setDelta(1); }}
              >
                adjust
              </button>
              {openId === i.id ? (
                <span className="flex w-full items-center gap-s2 pt-s1">
                  <input type="number" className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-sm" value={delta} onChange={(e) => setDelta(Number(e.target.value) || 0)} />
                  <Button disabled={pending || delta === 0} onClick={() => adjust(i.id, delta)}>Apply</Button>
                  <span className="text-[11px] text-muted">negative = issued out</span>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
