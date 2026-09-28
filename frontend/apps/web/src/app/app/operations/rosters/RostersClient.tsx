"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import { upsertDutyRosterAction, removeDutyRosterAction, emitRosterTasksAction, type DutyRosterRow } from "@/lib/api";

const DAYS = [
  { n: 1, label: "Monday" }, { n: 2, label: "Tuesday" }, { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" }, { n: 5, label: "Friday" }, { n: 6, label: "Saturday" },
];
const SLOTS = ["morning", "break", "lunch", "evening", "night"] as const;

export function RostersClient({ rows, staff }: { rows: DutyRosterRow[]; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [weekday, setWeekday] = useState(1);
  const [slot, setSlot] = useState<(typeof SLOTS)[number]>("break");
  const [duty, setDuty] = useState("");
  const [place, setPlace] = useState("");

  function add() {
    if (!staffId || !duty.trim()) {
      setMsg({ ok: false, text: "Pick a staff member and write the duty." });
      return;
    }
    start(async () => {
      const r = await upsertDutyRosterAction({ staffId, weekday, slot, duty: duty.trim(), place: place.trim() || null });
      setMsg(r.ok ? { ok: true, text: "Duty slot added." } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) { setDuty(""); setPlace(""); router.refresh(); }
    });
  }

  const active = rows.filter((x) => x.active);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHead title="This week" sub="Grouped by day · remove ends a slot" />
        <div className="flex flex-col gap-4">
          {active.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No duty slots yet — add the first one.</p>
          ) : DAYS.map(({ n, label }) => {
            const dayRows = active.filter((x) => x.weekday === n);
            if (dayRows.length === 0) return null;
            return (
              <div key={n}>
                <p className="microlabel mb-1.5">{label}</p>
                <div className="flex flex-col divide-y divide-paper-200 rounded-sm border border-paper-200">
                  {dayRows.map((x) => (
                    <div key={x.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                      <span className="w-[74px] font-mono text-[11.5px] uppercase tracking-wide text-muted">{x.slot}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink-950">{x.duty}</span>
                        <span className="block text-[12px] text-muted">{x.staff}{x.place ? ` · ${x.place}` : ""}</span>
                      </span>
                      {x.tasked_today ? <span className="rounded-pill bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase text-primary">in tasks</span> : null}
                      <button disabled={pending}
                        onClick={() => start(async () => { const r = await removeDutyRosterAction({ id: x.id }); setMsg(r.ok ? { ok: true, text: "Slot removed." } : { ok: false, text: r.error ?? "Failed" }); if (r.ok) router.refresh(); })}
                        className="text-[11.5px] font-semibold text-danger hover:underline">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHead title="Add a slot" sub="One audited write" />
        <div className="flex flex-col gap-2.5">
          <label className="microlabel" htmlFor="roster-staff">Staff</label>
          <select id="roster-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary">
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="microlabel" htmlFor="roster-day">Day</label>
          <select id="roster-day" value={weekday} onChange={(e) => setWeekday(parseInt(e.target.value, 10))}
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary">
            {DAYS.map((d) => <option key={d.n} value={d.n}>{d.label}</option>)}
          </select>
          <label className="microlabel" htmlFor="roster-slot">Slot</label>
          <select id="roster-slot" value={slot} onChange={(e) => setSlot(e.target.value as (typeof SLOTS)[number])}
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary">
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="microlabel" htmlFor="roster-duty">Duty</label>
          <input id="roster-duty" value={duty} onChange={(e) => setDuty(e.target.value)} placeholder="Gate supervision"
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary" />
          <label className="microlabel" htmlFor="roster-place">Place (optional)</label>
          <input id="roster-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Main gate"
            className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] outline-none focus:border-primary" />
          <Button size="sm" disabled={pending} onClick={add}>Add slot</Button>
        </div>
      </Card>

      <div className="lg:col-span-2">
        <Card>
          <CardHead
            title="Fold today into Tasks"
            sub="Each of today's slots lands in the assignee's Tasks inbox — idempotent per day"
            action={<ClipboardCheck aria-hidden size={18} className="text-muted" />}
          />
          <div className="flex items-center gap-3 px-4 pb-4">
            <Button size="sm" disabled={pending} onClick={() => start(async () => {
              const r = await emitRosterTasksAction();
              const n = (r as { data?: { emitted?: number } }).data?.emitted;
              setMsg(r.ok ? { ok: true, text: typeof n === "number" ? `${n} task${n === 1 ? "" : "s"} emitted to staff inboxes.` : "Today's slots checked — already in inboxes." } : { ok: false, text: r.error ?? "Failed" });
              if (r.ok) router.refresh();
            })}>Emit today&apos;s duty tasks</Button>
            <p className="text-[12px] text-muted">The roster is the recurring truth; Tasks is the daily nudge.</p>
          </div>
        </Card>
      </div>

      {msg ? <p className={`lg:col-span-2 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p> : null}
    </div>
  );
}
