"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, EmptyState, SelectMenu, StatusPill } from "@mandela/ui";
import { addBoardMemberAction, recordMeetingAction, type BoardData } from "@/lib/api";

/** Board client — members + meetings with the decisions register. */
export function BoardClient({
  members,
  meetings,
}: {
  members: BoardData["members"];
  meetings: BoardData["meetings"];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [office, setOffice] = useState("member");
  const [phone, setPhone] = useState("");
  const [termEnd, setTermEnd] = useState("");

  const [mTitle, setMTitle] = useState("");
  const [mDate, setMDate] = useState("");
  const [mMinutes, setMMinutes] = useState("");
  const [d1, setD1] = useState("");
  const [d1Owner, setD1Owner] = useState("");
  const [d1Due, setD1Due] = useState("");

  const addMember = () => {
    setErr(null);
    if (name.trim().length < 2) return setErr("Name required.");
    start(async () => {
      const r = await addBoardMemberAction({ fullName: name.trim(), office, phone: phone.trim() || null, termEnd: termEnd || null });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setName(""); setPhone(""); setTermEnd(""); setMsg("Member added.");
      router.refresh();
    });
  };

  const record = () => {
    setErr(null);
    if (mTitle.trim().length < 2 || !mDate) return setErr("Title and date required.");
    if (d1.trim().length < 2) return setErr("Record at least the first decision.");
    start(async () => {
      const r = await recordMeetingAction({
        title: mTitle.trim(), heldOn: mDate, minutes: mMinutes.trim() || null,
        decisions: [{ decision: d1.trim(), owner: d1Owner.trim() || null, dueOn: d1Due || null }],
      });
      if (!r.ok) { setErr(r.error ?? "failed"); return; }
      setMTitle(""); setMDate(""); setMMinutes(""); setD1(""); setD1Owner(""); setD1Due("");
      setMsg("Meeting recorded; decision is now chaseable.");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-s4 xl:grid-cols-2">
      <Card>
        <CardHead title="Members" sub="Offices and term expiries — the expiry chip is the renewal nudge." />
        {members.length === 0 ? (
          <EmptyState title="No board members yet" body="Add the chair, treasurer, secretary and BOM representatives." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-semibold text-text">{m.full_name}</span>
                  <span className="ml-s2 text-xs text-muted">{m.phone ?? ""}</span>
                </span>
                <span className="flex items-center gap-s2">
                  {m.term_end ? <span className="font-mono text-[11px] text-muted">till {m.term_end}</span> : null}
                  <StatusPill tone={m.office === "chair" ? "ok" : "neutral"}>{m.office}</StatusPill>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-5">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectMenu
            className="h-10"
            value={office}
            onChange={setOffice}
            ariaLabel="Office"
            options={[
              { value: "chair", label: "chair" },
              { value: "treasurer", label: "treasurer" },
              { value: "secretary", label: "secretary" },
              { value: "member", label: "member" },
              { value: "bom-rep", label: "bom-rep" },
            ]}
          />
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
          <div className="sm:col-span-5">
            <Button variant="primary" disabled={pending} onClick={addMember}>Add member</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Record a meeting" sub="Agenda, minutes-in-brief, and the decisions with owners + due dates." />
        <div className="grid gap-s2 p-s5 sm:grid-cols-2">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Meeting title" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
          <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={mDate} onChange={(e) => setMDate(e.target.value)} />
          <textarea className="min-h-[60px] rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" placeholder="Minutes in brief" value={mMinutes} onChange={(e) => setMMinutes(e.target.value)} />
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" placeholder="Decision 1 (e.g. Approve new bus loan)" value={d1} onChange={(e) => setD1(e.target.value)} />
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Owner" value={d1Owner} onChange={(e) => setD1Owner(e.target.value)} />
          <input type="date" className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={d1Due} onChange={(e) => setD1Due(e.target.value)} />
          <div className="sm:col-span-2">
            <Button variant="primary" disabled={pending} onClick={record}>Record meeting</Button>
          </div>
        </div>
        {err ? <p className="px-s5 pb-s4 text-sm text-danger">{err}</p> : null}
        {msg ? <p className="px-s5 pb-s4 text-sm text-ok">{msg}</p> : null}
      </Card>

      <Card className="xl:col-span-2">
        <CardHead title="Decisions register" sub="Every decision, its owner and due date — searchable governance." />
        {meetings.length === 0 ? (
          <p className="p-s5 text-sm text-muted">No meetings recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-s4 px-s5 pb-s5">
            {meetings.map((m) => (
              <div key={m.id} className="rounded-lg border border-border p-s4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text">{m.title}</span>
                  <span className="font-mono text-xs text-muted">{m.held_on}</span>
                </div>
                {m.minutes ? <p className="mt-s1 text-sm text-muted">{m.minutes}</p> : null}
                {m.items.length > 0 ? (
                  <div className="mt-s2 flex flex-col divide-y divide-border">
                    {m.items.map((i) => (
                      <div key={i.id} className="flex flex-wrap items-center gap-s2 py-1.5 text-sm">
                        <StatusPill tone={i.status === "open" ? "warn" : "ok"}>{i.status}</StatusPill>
                        <span className="text-text">{i.decision}</span>
                        {i.owner ? <span className="text-xs text-muted">· {i.owner}</span> : null}
                        {i.due_on ? <span className="font-mono text-[11px] text-muted">due {i.due_on}</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
