"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { cancelEventAction, updateEventAction, type EventRow } from "@/lib/api";

/**
 * CalendarList — the calendar you can work (the edit pass): every event
 * carries Edit and Cancel. Cancel is leaders-only at the API and audited
 * with the title, so the trail still tells the story.
 */
export function CalendarList({ rows, canEdit }: { rows: EventRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<EventRow | null>(null);
  const [pending, start] = useTransition();

  const cancel = (e: EventRow) => {
    start(async () => {
      const r = await cancelEventAction({ id: e.id });
      setMsg(r.ok ? { ok: true, text: `“${e.title}” removed from the calendar — the audit trail keeps the record.` } : { ok: false, text: r.error ?? "Could not cancel." });
      setConfirming(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <Card>
      <CardHead title="Calendar" sub={`${rows.length} on the calendar · every row can be corrected here, no re-entry needed.`} />
      {msg ? (
        <p role="status" className={`px-s5 pb-s2 text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-s5 pb-s5 text-[13px] text-ink-500">Nothing scheduled yet — add the term's first event below.</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200 px-s5 pb-s4">
          {rows.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-s3 py-2.5 text-sm">
              <span className="w-24 shrink-0 font-mono text-[12px] text-muted">{e.starts_on}{e.ends_on ? ` → ${e.ends_on}` : ""}</span>
              <StatusPill tone={e.kind === "exam-window" ? "warn" : e.kind === "holiday" ? "neutral" : "ok"}>{e.kind}</StatusPill>
              <span className="font-semibold text-ink-950">{e.title}</span>
              {e.notes ? <span className="text-muted">· {e.notes}</span> : null}
              {canEdit ? (
                <span className="ml-auto flex shrink-0 gap-1">
                  <Button size="sm2" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                  <Button size="sm2" variant="ghost" onClick={() => setConfirming(e)}>Cancel</Button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-[420px] rounded bg-surface p-s6 shadow-2">
            <p className="font-display text-lg font-bold text-ink-950">Remove “{confirming.title}”?</p>
            <p className="mt-2 text-[13px] text-ink-600">
              The event comes off the calendar. Guardians who were pointed at it will see it gone — the audit trail records who cancelled it.
            </p>
            <div className="mt-s4 flex gap-2">
              <Button variant="danger" size="sm" disabled={pending} onClick={() => cancel(confirming)}>{pending ? "Removing…" : "Yes, remove it"}</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep it</Button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <EditEventDialog
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setMsg({ ok: true, text }); setEditing(null); router.refresh(); }}
        />
      ) : null}
    </Card>
  );
}

function EditEventDialog({ event, onClose, onSaved }: {
  event: EventRow;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState(event.title);
  const [kind, setKind] = useState(event.kind);
  const [startsOn, setStartsOn] = useState(event.starts_on.slice(0, 10));
  const [endsOn, setEndsOn] = useState(event.ends_on?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");

  const save = () => {
    setErr(null);
    if (title.trim().length < 2) return setErr("Give the event a title (2+ letters).");
    if (!startsOn) return setErr("Pick a start date.");
    start(async () => {
      const r = await updateEventAction({ id: event.id, title: title.trim(), kind, startsOn, endsOn: endsOn || null, notes: notes.trim() || null });
      if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      onSaved(`“${title.trim()}” updated.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${event.title}`}>
      <div className="w-full max-w-[480px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">Edit event</p>
            <p className="font-display text-xl font-bold text-ink-950">{event.title}</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ev-title">Title *</label>
            <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ev-kind">Kind</label>
            <select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
              {["event", "exam-window", "open-day", "holiday", "meeting"].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ev-start">Starts *</label>
              <input id="ev-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ev-end">Ends (optional)</label>
              <input id="ev-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="ev-notes">Notes (optional)</label>
            <input id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
          </div>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
