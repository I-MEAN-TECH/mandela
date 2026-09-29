"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill, EmptyState } from "@mandela/ui";
import { reportRepairAction, setRepairStateAction, type RepairRow } from "@/lib/api";

/** Facilities client — the two-tap report form + the repair queue. */
export function FacilitiesClient({ rows }: { rows: RepairRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState(1);
  const [condition, setCondition] = useState("broken");
  const [note, setNote] = useState("");
  const [est, setEst] = useState("");
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const file = () => {
    setErr(null); setMsg(null);
    if (room.trim().length < 1) return setErr("Which room?");
    if (item.trim().length < 1) return setErr("What item?");
    start(async () => {
      const r = await reportRepairAction({
        room: room.trim(), item: item.trim(), qty,
        condition, note: note.trim() || null,
        estCostCents: est ? Math.round(Number(est) * 100) : 0,
        replaceValueCents: val ? Math.round(Number(val) * 100) : 0,
      });
      if (!r.ok) { setErr(r.error ?? "could not file the report"); return; }
      const data = r.data as { verdict?: string; state?: string } | undefined;
      setMsg(`Filed. Verdict: ${data?.verdict ?? "repair"}${data?.state === "out-of-service" ? " · item OUT OF SERVICE (safety first)" : ""}`);
      setRoom(""); setItem(""); setNote(""); setEst(""); setVal("");
      setOpen(false);
      router.refresh();
    });
  };

  const setState = (id: string, state: string) => {
    start(async () => {
      await setRepairStateAction({ id, state });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      <Card>
        <CardHead
          title="Repair queue"
          sub="Anyone can report; leadership resolves. The verdict came from the rule, not a meeting."
          action={<Button variant="primary" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "+ Report damage"}</Button>}
        />
        {open ? (
          <div className="flex max-w-xl flex-col gap-s3 p-s5">
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Room / area</span>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="G7B classroom" value={room} onChange={(e) => setRoom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Item</span>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Desks" value={item} onChange={(e) => setItem(e.target.value)} />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">How many</span>
              <input type="number" min={1} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Condition</span>
              <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}>
                <option value="worn">Worn</option>
                <option value="broken">Broken</option>
                <option value="structural">Structural damage</option>
              </select>
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Est. repair cost (Ksh, optional)</span>
              <input type="number" min={0} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="800" value={est} onChange={(e) => setEst(e.target.value)} />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Replacement value (Ksh, optional)</span>
              <input type="number" min={0} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="3500" value={val} onChange={(e) => setVal(e.target.value)} />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Note (optional)</span>
              <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Rear-left leg cracked, two learners affected" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            {msg ? <p className="text-sm text-ok">{msg}</p> : null}
            <div>
              <Button variant="primary" disabled={pending} onClick={file}>File report</Button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing reported" body="When a chair breaks, report it here in two taps — before a learner sits on it." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-s2 py-2.5 text-sm">
                <StatusPill tone={r.condition === "structural" ? "danger" : r.state === "open" ? "warn" : "neutral"}>
                  {r.state === "out-of-service" ? "OUT OF SERVICE" : r.state}
                </StatusPill>
                <span className="font-semibold text-text">{r.room}</span>
                <span className="text-muted">· {r.item} ×{r.qty} · {r.condition}</span>
                {r.verdict ? <StatusPill tone={r.verdict === "replace" ? "warn" : "ok"}>{r.verdict}</StatusPill> : null}
                {Number(r.est_cost_cents) > 0 ? <Money cents={r.est_cost_cents} className="text-[12.5px]" /> : null}
                {r.note ? <span className="text-muted">· {r.note}</span> : null}
                {r.state === "open" ? (
                  <span className="ml-auto flex flex-wrap items-center gap-s2" role="group" aria-label="Set repair state">
                    <Button size="sm2" disabled={pending} onClick={() => setState(r.id, "in-repair")}>In repair</Button>
                    <Button size="sm2" variant="primary" disabled={pending} onClick={() => setState(r.id, "done")}>Done</Button>
                    <Button size="sm2" variant="danger" disabled={pending} onClick={() => setState(r.id, "out-of-service")}>Out of service</Button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
