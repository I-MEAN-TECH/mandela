"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import { recordLaundryMoveAction, type LaundryRow } from "@/lib/api";

/**
 * Laundry custody (flank #12) — the garment-tracking half of pocket money &
 * laundry. Out to the laundry, back in; the "still out" column answers
 * "where is my sweater" without a new module. Every move is audited.
 */
export function LaundryClient({ rows, boarders, outNow }: {
  rows: LaundryRow[];
  boarders: { id: string; name: string }[];
  outNow: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function move(direction: "out" | "in") {
    const name = window.prompt(`Which boarder? (${boarders.slice(0, 5).map((b) => b.name.split(" ")[0]).join(", ")}${boarders.length > 5 ? "…" : ""})`, boarders[0]?.name ?? "");
    if (!name) return;
    const b = boarders.find((x) => x.name.toLowerCase().startsWith(name.trim().toLowerCase()));
    if (!b) { setMsg({ ok: false, text: `No boarder starts with “${name}”.` }); return; }
    // "in" needs no item count — the return clears whatever is out.
    const items = direction === "out"
      ? window.prompt("What went OUT? (e.g. 2 trousers, 3 shirts)", "")
      : null;
    if (direction === "out" && !items?.trim()) { setMsg({ ok: false, text: "Say what moved — the custody trail needs it." }); return; }
    const bagRef = direction === "out" ? window.prompt("Bag tag (optional)", "") ?? "" : "";
    start(async () => {
      const r = await recordLaundryMoveAction({ learnerId: b.id, direction, items: items?.trim() || null, bagRef: bagRef.trim() || null });
      setMsg(r.ok ? { ok: true, text: `${b.name}: ${direction === "out" ? "sent out" : "received back"}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Laundry custody"
        sub={`Per-boarder garment handover · ${outNow} bag${outNow === 1 ? "" : "s"} still out`}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={pending || boarders.length === 0} onClick={() => move("out")}>Send out</Button>
            <Button size="sm" variant="secondary" disabled={pending || boarders.length === 0} onClick={() => move("in")}>Receive in</Button>
          </div>
        }
      />
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted">No boarders yet — custody rows appear when boarding learners exist.</p>
      ) : (
        <div className="flex max-h-[360px] flex-col divide-y divide-paper-200 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.learner_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-[170px] flex-1">
                <p className="text-[13px] font-semibold text-ink-950">{r.learner}</p>
                <p className="text-[11.5px] text-muted">{r.class_name ?? "—"}</p>
              </div>
              {r.out_at ? (
                <div className="min-w-[220px] flex-1">
                  <p className="text-[12.5px] text-ink-950">{r.out_items}{r.bag_ref ? <span className="ml-1.5 font-mono text-[10px] uppercase text-primary">{r.bag_ref}</span> : null}</p>
                  <p className="font-mono text-[11px] text-muted">out {String(r.out_at).slice(0, 10)}</p>
                </div>
              ) : (
                <p className="min-w-[220px] flex-1 text-[12.5px] text-muted">nothing out — kit in dorm</p>
              )}
            </div>
          ))}
        </div>
      )}
      {msg ? <p className={`border-t border-paper-200 px-4 py-2.5 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p> : null}
    </Card>
  );
}
