"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState } from "@mandela/ui";
import { autolayoutTimetableAction, clearSlotAction, upsertSlotAction, type TimetableData } from "@/lib/api";

/**
 * Timetable client ⑲ — pick a class, see its week (days × periods), click a
 * cell to fill it. Cells hold either a teaching period (area, teacher, room)
 * or day-structure entries: tea break, lunch, games, home time — no teacher
 * needed, no clash guard, excluded from coverage. Subject suggestions come
 * from the school's curriculum pack (all CBC levels + 8-4-4 seeded).
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Non-teaching day structure — whole-school rhythm, not a subject. */
const KIND_PRESETS = [
  { kind: "tea", label: "🍵 Tea break" },
  { kind: "lunch", label: "🍛 Lunch" },
  { kind: "games", label: "⚽ Games" },
  { kind: "home", label: "🏠 Home time" },
] as const;

const KIND_META: Record<string, { label: string; cell: string; chip: string }> = {
  tea: { label: "Tea break", cell: "border-amber-300 bg-amber-50 hover:border-amber-400", chip: "bg-amber-100 text-amber-900" },
  lunch: { label: "Lunch", cell: "border-orange-300 bg-orange-50 hover:border-orange-400", chip: "bg-orange-100 text-orange-900" },
  games: { label: "Games", cell: "border-sky-300 bg-sky-50 hover:border-sky-400", chip: "bg-sky-100 text-sky-900" },
  home: { label: "Home time", cell: "border-violet-300 bg-violet-50 hover:border-violet-400", chip: "bg-violet-100 text-violet-900" },
};

export function TimetableClient({ data, canEdit }: { data: TimetableData; canEdit: boolean }) {
  const router = useRouter();
  const [classId, setClassId] = useState<number | null>(data.classes[0]?.id ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ day: number; period: number; slot?: TimetableData["slots"][number] } | null>(null);
  const [autoPending, startAuto] = useTransition();

  const cls = data.classes.find((c) => c.id === classId) ?? null;
  const areas = classId != null ? data.areasByClass?.[String(classId)] ?? [] : [];

  // C12 — one-tap gap-fill: places existing area rows into free (day, period)
  // cells with a clash-free teacher. Never moves a placed slot or a break.
  const autolayout = () =>
    startAuto(async () => {
      const r = await autolayoutTimetableAction();
      if (!r.ok) setMsg({ ok: false, text: r.error ?? "Could not auto-layout" });
      else {
        setMsg({ ok: true, text: `Auto-layout placed ${r.placed ?? 0} period${(r.placed ?? 0) === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped (no free teacher)` : ""} — audited.` });
        router.refresh();
      }
    });

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
            <span className="text-[12px] text-muted">Fills empty periods with each class's areas — never moves a placed slot or a break.</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-s2 border-b border-paper-200 px-s5 py-s3">
          <span className="microlabel !mb-0">Download for the classroom</span>
          <a
            href={`/print/timetable?classId=${classId}&orientation=portrait`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-pill border border-paper-300 px-3.5 text-[12px] font-semibold text-ink-950 hover:border-pine-400 hover:bg-paper-50"
          >
            Portrait A4
          </a>
          <a
            href={`/print/timetable?classId=${classId}&orientation=landscape`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-pill border border-paper-300 px-3.5 text-[12px] font-semibold text-ink-950 hover:border-pine-400 hover:bg-paper-50"
          >
            Landscape A4
          </a>
          <span className="text-[12px] text-muted">Opens the print view — Print or Save as PDF for the wall copy.</span>
        </div>
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
                    const isBreak = !!slot && slot.slot_kind !== "lesson";
                    const meta = isBreak ? KIND_META[slot.slot_kind] : undefined;
                    return (
                      <td key={day} className="py-1 pr-1">
                        {slot ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && setEditing({ day, period, slot })}
                            className={`w-full rounded-sm border px-2.5 py-2 text-left transition-colors ${
                              meta ? meta.cell
                                : canEdit ? "border-paper-300 hover:border-pine-400 hover:bg-paper-50" : "border-paper-200"
                            }`}
                          >
                            {isBreak ? (
                              <>
                                <span className={`inline-block rounded-pill px-2 py-0.5 text-[11px] font-bold ${meta?.chip ?? ""}`}>
                                  {meta?.label ?? slot.area_name ?? "Break"}
                                </span>
                                {slot.starts_at ? (
                                  <span className="mt-1 block truncate font-mono text-[10.5px] text-ink-500">
                                    {slot.starts_at}{slot.ends_at ? `–${slot.ends_at}` : ""}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <span className="block truncate text-[12.5px] font-semibold text-ink-950">{slot.area_name ?? "—"}</span>
                                {slot.starts_at ? (
                                  <span className="block truncate font-mono text-[10.5px] text-pine-700">
                                    {slot.starts_at}{slot.ends_at ? `–${slot.ends_at}` : ""}
                                  </span>
                                ) : null}
                                <span className="block truncate text-[11px] text-ink-500">{slot.teacher_name ?? "no teacher"}{slot.room ? ` · ${slot.room}` : ""}</span>
                              </>
                            )}
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
          areas={areas}
          onClose={() => setEditing(null)}
          onDone={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
          onCleared={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

const kindOf = (s?: TimetableData["slots"][number]) =>
  s && s.slot_kind !== "lesson" ? s.slot_kind : "lesson";

function SlotDialog({ cls, cell, teachers, areas, onClose, onDone, onCleared }: {
  cls: { id: number; code: string; name: string };
  cell: { day: number; period: number; slot?: TimetableData["slots"][number] };
  teachers: { id: string; name: string }[];
  areas: { code: string; name: string }[];
  onClose: () => void;
  onDone: (text: string) => void;
  onCleared: (text: string) => void;
}) {
  const s = cell.slot;
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<string>(kindOf(s));
  const [areaCode, setAreaCode] = useState(s?.area_code ?? "");
  const [areaName, setAreaName] = useState(s?.area_name ?? "");
  const [teacherId, setTeacherId] = useState(s?.teacher_id ?? "");
  const [room, setRoom] = useState(s?.room ?? "");
  const [startsAt, setStartsAt] = useState(s?.starts_at ?? "");
  const [endsAt, setEndsAt] = useState(s?.ends_at ?? "");

  const isLesson = kind === "lesson";

  const pickKind = (k: string, label?: string) => {
    setKind(k);
    if (k !== "lesson") {
      setAreaCode(k.toUpperCase());
      setAreaName(label ?? KIND_META[k]?.label ?? "");
      setTeacherId("");
    } else {
      setAreaCode("");
      setAreaName("");
    }
  };

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
        teacherId: isLesson ? teacherId || null : null,
        room: room || null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        slotKind: kind,
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
      <div className="w-full max-w-[560px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">{s ? "Edit period" : "Fill period"}</p>
            <p className="font-display text-xl font-bold text-ink-950">{cls.name} · {DAYS[cell.day - 1]} · P{cell.period}</p>
            <p className="text-[12px] text-ink-500">Lessons get a teacher (double-booking is refused loudly). Breaks and home time are day structure — no teacher needed.</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-ink-700">Slot type</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => pickKind("lesson")}
                className={`h-8 rounded-pill px-3 text-[12px] font-semibold ${
                  isLesson ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"
                }`}
              >
                📚 Lesson
              </button>
              {KIND_PRESETS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => pickKind(k.kind, k.label)}
                  className={`h-8 rounded-pill px-3 text-[12px] font-semibold ${
                    kind === k.kind ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {isLesson ? (
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-ink-700">
                Learning area {areas.length ? <span className="font-normal text-muted">— {cls.name}'s curriculum</span> : null}
              </span>
              <div className="mb-2 max-h-[132px] overflow-y-auto rounded-sm border border-paper-200 p-2">
                <div className="flex flex-wrap gap-1.5">
                  {areas.length ? areas.map((a) => (
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
                  )) : (
                    <span className="px-1 text-[12px] text-muted">No curriculum areas linked to this class yet — type a code and name below.</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="Code (ENG)" aria-label="Area code" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
                <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Name (English)" aria-label="Area name" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
              </div>
            </div>
          ) : null}

          {isLesson ? (
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="tt-teacher">Teacher</label>
              <select id="tt-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
                <option value="">Not assigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="tt-room">Room {isLesson ? "" : "(optional — e.g. field, hall)"}</label>
              <input id="tt-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={isLesson ? "e.g. Room 4" : "e.g. Hall / Field"} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
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
