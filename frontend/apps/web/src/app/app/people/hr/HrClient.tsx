"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { raiseLeaveAction, decideLeaveAction, type HrData } from "@/lib/api";

/**
 * HR & Leave client ⑥ — raise a request (any active staff on behalf — the
 * admin keys what the office receives), the decision queue with mandatory
 * reasons, and the entitlement table. One screen answers: who is out,
 * what waits, what remains.
 */

const KIND_LABEL: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  other: "Other",
};

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function HrClient({ data, staff, canDecide }: { data: HrData; staff: { id: string; name: string; role: string }[]; canDecide: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; name: string; approve: boolean } | null>(null);

  return (
    <>
      {msg ? (
        <p role="status" className={`text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}

      <RaiseForm staff={staff} onDone={(text) => { setMsg({ ok: true, text }); router.refresh(); }} />

      <Card>
        <CardHead
          title="Awaiting your decision"
          sub={canDecide ? "Approve or reject with a reason — the reason is mandatory and audited" : "Leaders decide; you see the queue"}
        />
        {data.pending.length === 0 ? (
          <p className="px-s5 pb-s5 text-[13px] text-ink-500">Nothing waiting — the queue is clear.</p>
        ) : (
          <div className="flex flex-col divide-y divide-paper-200">
            {data.pending.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-s5 py-s3">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[13.5px] font-semibold text-ink-950">{l.staff_name} <span className="text-ink-500">· {KIND_LABEL[l.kind] ?? l.kind}</span></p>
                  <p className="text-[12px] text-ink-500">{fmt(l.starts_on)} → {fmt(l.ends_on)} · {l.days} day{l.days === 1 ? "" : "s"}{l.reason ? ` · “${l.reason}”` : ""}</p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <Button size="sm2" variant="primary" onClick={() => setDeciding({ id: l.id, name: l.staff_name, approve: true })}>Approve…</Button>
                    <Button size="sm2" variant="ghost" onClick={() => setDeciding({ id: l.id, name: l.staff_name, approve: false })}>Reject…</Button>
                  </div>
                ) : (
                  <StatusPill tone="warn">pending</StatusPill>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-s4">
        <Card>
          <CardHead title="Out today" sub="Approved leave covering today — plan cover lessons around these names" />
          {data.onLeaveToday.length === 0 ? (
            <p className="px-s5 pb-s5 text-[13px] text-ink-500">Everyone in. No approved leave covers today.</p>
          ) : (
            <div className="flex flex-col divide-y divide-paper-200">
              {data.onLeaveToday.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-s5 py-s2.5">
                  <p className="text-[13px] font-semibold text-ink-950">{l.staff_name}</p>
                  <p className="text-[12px] text-ink-500">{KIND_LABEL[l.kind] ?? l.kind} · back {fmt(l.ends_on)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Recent decisions" sub="The trail — who decided what, and why" />
          {data.recent.length === 0 ? (
            <p className="px-s5 pb-s5 text-[13px] text-ink-500">No decisions yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-paper-200">
              {data.recent.map((l) => (
                <div key={l.id} className="px-s5 py-s2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-ink-950">{l.staff_name} · {KIND_LABEL[l.kind] ?? l.kind}</p>
                    <StatusPill tone={l.state === "approved" ? "ok" : l.state === "rejected" ? "danger" : "neutral"}>{l.state}</StatusPill>
                  </div>
                  <p className="text-[12px] text-ink-500">
                    {fmt(l.starts_on)} → {fmt(l.ends_on)} · {l.days}d{l.decision_reason ? ` · “${l.decision_reason}”` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHead
          title="Entitlement — days taken vs entitlement"
          sub="Approved days this calendar year against the school's rules (tunable per BOM policy)"
        />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Staff", "Kind", "Taken", "Entitlement", ""].map((h) => (
                  <th key={h} className="microlabel px-s3 pb-s2 pt-s1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.balances.map((b, i) => {
                const pct = b.entitlement > 0 ? Math.min(100, Math.round((b.taken / b.entitlement) * 100)) : 0;
                return (
                  <tr key={`${b.staff_id}-${b.kind}`} className="border-b border-paper-200 last:border-0">
                    <td className="px-s3 py-s2 font-semibold text-ink-950">{b.staff_name}</td>
                    <td className="px-s3 py-s2 text-ink-700">{KIND_LABEL[b.kind] ?? b.kind}</td>
                    <td className="px-s3 py-s2 text-ink-950">{b.taken}</td>
                    <td className="px-s3 py-s2 text-ink-700">{b.entitlement}</td>
                    <td className="w-[140px] px-s3 py-s2">
                      <div className="h-1.5 w-full rounded-pill bg-paper-200">
                        <div
                          className={`h-1.5 rounded-pill ${pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warn" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.balances.length === 0 ? (
                <tr><td colSpan={5} className="px-s3 py-s4 text-[13px] text-ink-500">No staff on the register yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {deciding ? (
        <DecideDialog
          target={deciding}
          onClose={() => setDeciding(null)}
          onDone={(text) => { setMsg({ ok: true, text }); setDeciding(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}

function RaiseForm({ staff, onDone }: { staff: { id: string; name: string; role: string }[]; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const [kind, setKind] = useState("annual");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    setErr(null);
    if (!startsOn || !endsOn) return setErr("Pick the first and last day.");
    if (endsOn < startsOn) return setErr("Leave cannot end before it starts.");
    start(async () => {
      const r = await raiseLeaveAction({ staffId: staffId || undefined, kind, startsOn, endsOn, reason: reason.trim() });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      setOpen(false);
      setStartsOn(""); setEndsOn(""); setReason("");
      onDone("Leave request raised — it waits in the decision queue below.");
    });
  };

  if (!open) {
    return (
      <div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Raise leave request</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHead
        title="Raise a leave request"
        sub="Leave the staff pick empty to raise for yourself. Leaders decide below."
        action={<Button variant="ghost" size="sm2" onClick={() => setOpen(false)}>Close</Button>}
      />
      <form
        className="grid max-w-[520px] gap-s3 px-s5 pb-s5"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        noValidate
      >
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-staff">Staff member</label>
          <select id="hr-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
            <option value="">Myself</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-kind">Kind</label>
          <select id="hr-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-from">First day *</label>
          <input id="hr-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-to">Last day *</label>
          <input id="hr-to" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-why">Reason</label>
          <input id="hr-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the leave is needed" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Raising…" : "Raise request"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function DecideDialog({ target, onClose, onDone }: {
  target: { id: string; name: string; approve: boolean };
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const submit = () => {
    setErr(null);
    if (reason.trim().length < 4) return setErr("A reason is mandatory — even for approvals.");
    start(async () => {
      const r = await decideLeaveAction({ id: target.id, approve: target.approve, reason: reason.trim() });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      onDone(`${target.name}'s leave ${target.approve ? "approved" : "rejected"} — the reason is on the audit trail.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Decide leave">
      <div className="w-full max-w-[480px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">{target.approve ? "Approve" : "Reject"} leave</p>
            <p className="font-display text-xl font-bold text-ink-950">{target.name}</p>
            <p className="text-[12px] text-ink-500">The reason is stored with the decision — it answers “why” for years.</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={onClose}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="hr-decide">Decision reason *</label>
            <input
              id="hr-decide"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={target.approve ? "e.g. Cover arranged with Mr. Otieno" : "e.g. Term week — no cover available"}
              className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]"
            />
          </div>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant={target.approve ? "primary" : "ghost"} disabled={pending}>
              {pending ? "Deciding…" : target.approve ? "Approve leave" : "Reject leave"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
