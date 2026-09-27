"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState } from "@mandela/ui";
import { autolayoutTimetableAction, clearSlotAction, upsertSlotAction, type TimetableData } from "@/lib/api";

/**
 * Timetable client ⑲ — pick a class, see its week (days × periods), click a
 * cell to fill it (area, teacher, room). The teacher-clash guard answers
 * inline; clearing is a soft off so history stays.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AREA_SUGGESTIONS = [
  { code: "ENG", name: "English" }, { code: "MAT", name: "Mathematics" },
  { code: "KIS", name: "Kiswahili" }, { code: "SCI", name: "Science" },
  { code: "SST", name: "Social Studies" }, { code: "CRE", name: "CRE" },
  { code: "PE", name: "PE & Sports" }, { code: "CLUB", name: "Clubs & Activities" },
];

export function TimetableClient({ data, canEdit }: { data: TimetableData; canEdit: boolean }) {
  const router = useRouter();
  const [classId, setClassId] = useState<number | null>(data.classes[0]?.id ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ day: number; period: number; slot?: TimetableData["slots"][number] } | null>(null);
  const [autoPending, startAuto] = useTransition();

  // C12 — one-tap gap-fill: places existing area rows into free (day, period)
  // cells with a clash-free teacher. Never moves a placed slot.
  const autolayout = () =>
    startAuto(async () => {
      const r = await autolayoutTimetableAction();
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Could not auto-layout" });
      else {
        setMsg({ ok: true, text: `Auto-layout placed ${r.placed ?? 0} period${(r.placed ?? 0) === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped (no free teacher)` : ""} — audited.` });
        router.refresh();
      }
    });

  const cls = data.classes.find((c) => c.id === classId) ?? null;
  const grid = useMemo(() => {
    const m = new Map<string, TimetableData["slots"][number]>();
    for (const s of data.slots) {
      if (s.class_id === classId && s.active) m.set(`${s.day_of_week}-${s.period}`, s);
    }
    return m;
  }, [data.slots, classId]);

  if (!cls) {
    return (
      <Card>
        <EmptyState title="No classes yet" body="Create classes first — the grid hangs off them." />
      </Card>
    );
  }

  return (
    <>
      {msg ? (
        <p role="status" className={`text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}

      <Card>
        <CardHead
          title="The week"
          sub={canEdit ? "Click any cell to fill or edit that period" : "Read-only — leaders edit the grid"}
          action={
            <select
              aria-label="Pick a class"
              value={classId ?? ""}
              onChange={(e) => setClassId(Number(e.target.value))}
              className="h-9 rounded-pill border border-paper-300 bg-surface px-3.5 text-[12.5px] text-ink-950 outline-none focus:border-pine-400"
            >
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          }
        />
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-s2 border-b border-paper-200 px-s5 py-s3">
            <Button variant="secondary" size="sm" onClick={autolayout} disabled={autoPending}>
              {autoPending ? "Laying out…" : "Auto-fill gaps"}
            </Button>
            <span className="text-[12px] text-muted">Fills empty periods with each class's areas — never moves a placed slot.</span>
          </div>
        ) : null}
        <div className="overflow-x-auto px-s5 pb-s5">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th className="microlabel w-[70px] pb-s2 text-left">Period</th>
                {DAYS.slice(0, 5).map((d, i) => (
                  <th key={d} className="microlabel pb-s2 text-left">{d} <span className="text-ink-400">{i + 1}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 9 }, (_, p) => p + 1).map((period) => (
                <tr key={period} className="border-t border-paper-200">
                  <td className="py-s2 pr-s2 font-mono text-[12px] text-ink-600">{period}</td>
                  {DAYS.slice(0, 5).map((_, di) => {
                    const day = di + 1;
                    const slot = grid.get(`${day}-${period}`);
                    return (
                      <td key={day} className="py-1 pr-1">
                        {slot ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && setEditing({ day, period, slot })}
                            className={`w-full rounded-sm border px-2.5 py-2 text-left transition-colors ${
                              canEdit ? "border-paper-300 hover:border-pine-400 hover:bg-paper-50" : "border-paper-200"
                            }`}
                          >
                            <span className="block truncate text-[12.5px] font-semibold text-ink-950">{slot.area_name ?? "—"}</span>
                            <span className="block truncate text-[11px] text-ink-500">{slot.teacher_name ?? "no teacher"}{slot.room ? ` · ${slot.room}` : ""}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && setEditing({ day, period })}
                            className={`grid h-[52px] w-full place-items-center rounded-sm border border-dashed border-paper-300 text-[12px] text-ink-400 ${
                              canEdit ? "hover:border-pine-400 hover:text-ink-700" : ""
                            }`}
                          >
                            {canEdit ? "+ fill" : "—"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing ? (
        <SlotDialog
          cls={cls}
          cell={editing}
          teachers={data.teachers}
          onClose={() => setEditing(null)}
          onDone={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
          onCleared={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

function SlotDialog({ cls, cell, teachers, onClose, onDone, onCleared }: {
  cls: { id: number; code: string; name: string };
  cell: { day: number; period: number; slot?: TimetableData["slots"][number] };
  teachers: { id: string; name: string }[];
  onClose: () => void;
  onDone: (text: string) => void;
  onCleared: (text: string) => void;
}) {
  const s = cell.slot;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState(s?.area_code ?? "");
  const [areaName, setAreaName] = useState(s?.area_name ?? "");
  const [teacherId, setTeacherId] = useState(s?.teacher_id ?? "");
  const [room, setRoom] = useState(s?.room ?? "");
  const [startsAt, setStartsAt] = useState(s?.starts_at ?? "");
  const [endsAt, setEndsAt] = useState(s?.ends_at ?? "");

  const save = () => {
    setErr(null);
    start(async () => {
      const r = await upsertSlotAction({
        id: s?.id,
        classId: cls.id,
        dayOfWeek: cell.day,
        period: cell.period,
        areaCode: areaCode || null,
        areaName: areaName || null,
        teacherId: teacherId || null,
        room: room || null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
      });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      onDone(`${cls.name} · ${DAYS[cell.day - 1]} P${cell.period} saved — audited.`);
    });
  };

  const clear = () => {
    if (!s) return;
    setErr(null);
    start(async () => {
      const r = await clearSlotAction({ id: s.id });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      onCleared(`${DAYS[cell.day - 1]} P${cell.period} cleared — the slot's history stays on the trail.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Edit period">
      <div className="w-full max-w-[500px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">{s ? "Edit period" : "Fill period"}</p>
            <p className="font-display text-xl font-bold text-ink-950">{cls.name} · {DAYS[cell.day - 1]} · P{cell.period}</p>
            <p className="text-[12px] text-ink-500">Assigning a teacher already booked elsewhere is refused with the clashing class named.</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Learning area</span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {AREA_SUGGESTIONS.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => { setAreaCode(a.code); setAreaName(a.name); }}
                  className={`h-8 rounded-pill px-3 text-[12px] font-semibold ${
                    areaCode === a.code ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="Code (ENG)" aria-label="Area code" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
              <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Name (English)" aria-label="Area name" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="tt-teacher">Teacher</label>
            <select id="tt-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
              <option value="">Not assigned</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="tt-room">Room</label>
              <input id="tt-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Room 4" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="tt-start">Time</label>
              <div className="flex items-center gap-1">
                <input id="tt-start" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} placeholder="08:00" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
                <span className="text-ink-400">–</span>
                <input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} placeholder="08:40" aria-label="Ends at" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
              </div>
            </div>
          </div>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save period"}</Button>
            {s ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={clear}>Clear slot</Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
