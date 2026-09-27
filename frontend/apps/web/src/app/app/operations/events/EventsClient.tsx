"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import { createEventAction } from "@/lib/api";

/** Add-event form — one audited write (㉔). */
export function EventsClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("event");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const save = () => {
    setErr(null); setOk(null);
    if (title.trim().length < 2) return setErr("Give the event a title.");
    if (!startsOn) return setErr("Pick a start date.");
    start(async () => {
      const r = await createEventAction({
        title: title.trim(), kind, startsOn, endsOn: endsOn || null, notes: notes.trim() || null,
      });
      if (!r.ok) { setErr(r.error ?? "could not add the event"); return; }
      setOk("Added to the calendar.");
      setTitle(""); setStartsOn(""); setEndsOn(""); setNotes("");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHead
        title="Add to the calendar"
        sub="One audited write — the event feeds guardian announcements by audience."
        action={<Button variant="primary" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "+ New event"}</Button>}
      />
      {open ? (
        <div className="grid gap-s3 p-s5 sm:grid-cols-2">
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Title</span>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Drama Festival — County round" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Kind</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="event">Event</option>
              <option value="exam-window">Exam window</option>
              <option value="open-day">Open day</option>
              <option value="holiday">Holiday</option>
              <option value="meeting">Meeting</option>
            </select>
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Starts</span>
            <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label className="flex flex-col gap-s1 text-sm">
            <span className="font-medium">Ends (optional)</span>
            <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
          <label className="flex flex-col gap-s1 text-sm sm:col-span-2">
            <span className="font-medium">Notes (optional)</span>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Kit packed the night before; buses leave 6:30 AM" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err ? <p className="text-sm text-danger sm:col-span-2">{err}</p> : null}
          {ok ? <p className="text-sm text-ok sm:col-span-2">{ok}</p> : null}
          <div className="sm:col-span-2">
            <Button variant="primary" disabled={pending} onClick={save}>Add event</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
