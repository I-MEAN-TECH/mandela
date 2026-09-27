"use client";

import { ArrowRight } from "lucide-react";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardHead, Money, StatusPill } from "@mandela/ui";
import {
  decideApprovalAction,
  raiseApprovalAction,
  createTaskAction,
  completeTaskAction,
  type ApprovalRow,
  type TaskRow,
} from "@/lib/api";

/**
 * Approvals Inbox (36) + Tasks (37) — the client surfaces.
 * Approve/reject with a MANDATORY reason (law: no decision without words);
 * tasks close with one tap and every action is audited.
 */

const TYPE_LABELS: Record<string, string> = {
  "fee-waiver": "Fee waiver",
  purchase: "Purchase",
  leave: "Leave",
  "route-add": "Route addition",
  "write-off": "Write-off",
  other: "Other",
};

function AgeChip({ days }: { days: number }) {
  if (days >= 7) return <span className="rounded-pill bg-danger-bg px-2 py-0.5 font-mono text-[10px] font-semibold text-danger">{days}d waiting</span>;
  if (days >= 3) return <span className="rounded-pill bg-warn-bg px-2 py-0.5 font-mono text-[10px] font-semibold text-warn">{days}d waiting</span>;
  return <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] text-ink-500">{days}d</span>;
}

export function RequestForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card>
      <CardHead title="Raise a request" sub="Purchases, fee waivers, leave, route additions — the queue for the other leader's sign-off." />
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const fd = new FormData(f);
          const amount = String(fd.get("amount") ?? "").trim();
          start(async () => {
            const r = await raiseApprovalAction({
              requestType: String(fd.get("requestType") ?? "other"),
              about: String(fd.get("about") ?? "") || undefined,
              note: String(fd.get("note") ?? "") || undefined,
              amountCents: amount ? Math.round(parseFloat(amount) * 100) : undefined,
            });
            if (r.ok) {
              f.reset();
              setMsg({ ok: true, text: "Request raised" });
              router.refresh();
            } else {
              setMsg({ ok: false, text: r.error ?? "Failed" });
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Type *</span>
          <select name="requestType" required defaultValue="purchase" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">About</span>
          <input name="about" maxLength={200} placeholder="e.g. 10 desks for G7" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Amount (Ksh, if money)</span>
          <input name="amount" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" title="A KES amount, e.g. 12500 or 12500.50" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Note</span>
          <input name="note" maxLength={500} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>Raise request</Button>
          {msg ? <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
        </div>
      </form>
    </Card>
  );
}

export function ApprovalsBoard({ pending, decided, canDecide, meName }: {
  pending: ApprovalRow[];
  decided: ApprovalRow[];
  canDecide: boolean;
  meName: string;
}) {
  const router = useRouter();
  const [pending_, start] = useTransition();
  const [deciding, setDeciding] = useState<{ row: ApprovalRow; decision: "approved" | "rejected" } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card>
      <CardHead
        title="Inbox"
        sub={canDecide ? "Approve or reject with a reason — the reason is the record." : "Your requests and their decisions appear here."}
      />
      {pending.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-500">Nothing waiting. The queue is clear.</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200">
          {pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 py-3.5">
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-ink-950">{TYPE_LABELS[r.request_type] ?? r.request_type}</p>
                  <AgeChip days={r.age_days} />
                </div>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {r.requester} · {r.payload.about ?? "no subject"}
                </p>
                {r.payload.note ? <p className="mt-0.5 text-[12px] text-ink-700">{r.payload.note}</p> : null}
              </div>
              {typeof r.payload.amount_cents === "number" ? (
                <p className="numeral text-[15px] font-semibold text-ink-950"><Money cents={r.payload.amount_cents} /></p>
              ) : null}
              {canDecide && r.requester !== meName ? (
                <div className="flex gap-2">
                  <Button variant="primary" disabled={pending_} onClick={() => setDeciding({ row: r, decision: "approved" })}>Approve…</Button>
                  <Button variant="danger" disabled={pending_} onClick={() => setDeciding({ row: r, decision: "rejected" })}>Reject…</Button>
                </div>
              ) : (
                <StatusPill tone="neutral">awaiting {r.requester_role === "admin" ? "admin" : "principal"}</StatusPill>
              )}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <div className="mt-4 border-t border-paper-200 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Recent decisions</p>
          <div className="mt-2 flex flex-col gap-2">
            {decided.slice(0, 6).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <StatusPill tone={r.state === "approved" ? "ok" : "danger"}>{r.state}</StatusPill>
                <span className="font-semibold text-ink-950">{TYPE_LABELS[r.request_type] ?? r.request_type}</span>
                <span className="text-ink-500">{r.requester} · decided by {r.decided_by}</span>
                <span className="text-ink-700">“{r.decision_reason}”</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-[12.5px] text-ink-700" role="status">{msg}</p> : null}
      {deciding ? (
        <DecisionDialog
          deciding={deciding}
          onClose={() => setDeciding(null)}
          onDone={(text) => {
            setDeciding(null);
            setMsg(text);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function DecisionDialog({
  deciding,
  onClose,
  onDone,
}: {
  deciding: { row: ApprovalRow; decision: "approved" | "rejected" };
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded bg-surface p-6 shadow-1">
        <p className="font-display text-[17px] font-semibold text-ink-950">
          {deciding.decision === "approved" ? "Approve" : "Reject"} {TYPE_LABELS[deciding.row.request_type] ?? deciding.row.request_type}
        </p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          From {deciding.row.requester}. The reason becomes part of the permanent record — say why.
        </p>
        <label className="mt-4 flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            className="rounded-sm border border-paper-300 bg-surface px-3 py-2 text-[13.5px] text-ink-950"
            placeholder={deciding.decision === "approved" ? "e.g. Within this term's budget" : "e.g. Wait until Term 1 collections recover"}
          />
        </label>
        {error ? <p className="mt-2 text-[12.5px] text-danger" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={deciding.decision === "approved" ? "primary" : "danger"}
            disabled={pending || reason.trim().length < 4}
            onClick={() =>
              start(async () => {
                const r = await decideApprovalAction({ id: deciding.row.id, decision: deciding.decision, reason: reason.trim() });
                if (r.ok) onDone(`${deciding.decision === "approved" ? "Approved" : "Rejected"} — reason recorded`);
                else setError(r.error ?? "Failed");
              })
            }
          >
            {deciding.decision === "approved" ? "Approve" : "Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TasksBoard({ open, done, canEdit, staff }: {
  open: TaskRow[];
  done: TaskRow[];
  canEdit: boolean;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function complete(t: TaskRow, state: "done" | "cancelled") {
    if (!canEdit) return;
    start(async () => {
      const r = await completeTaskAction({ id: t.id, state });
      setMsg(r.ok ? (state === "done" ? "Task done" : "Task cancelled") : r.error ?? "Failed");
      if (r.ok) router.refresh();
    });
  }

  const overdue = open.filter((t) => t.days_left !== null && t.days_left < 0);

  return (
    <Card>
      <CardHead
        title="Tasks & follow-ups"
        sub="The operating rhythm — chased defaulters, renewals, KEMIS gaps, term-close steps, plus anything you add."
      />
      {overdue.length > 0 ? (
        <p className="mb-3 rounded-sm bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-danger">
          {overdue.length} {overdue.length === 1 ? "task is" : "tasks are"} overdue.
        </p>
      ) : null}
      <div className="flex flex-col divide-y divide-paper-200">
        {open.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-ink-950">{t.title}</p>
                {t.source !== "manual" ? (
                  <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-500">{t.source}</span>
                ) : null}
                {t.days_left !== null ? (
                  t.days_left < 0 ? (
                    <span className="rounded-pill bg-danger-bg px-2 py-0.5 font-mono text-[10px] font-semibold text-danger">{-t.days_left}d overdue</span>
                  ) : t.days_left <= 7 ? (
                    <span className="rounded-pill bg-warn-bg px-2 py-0.5 font-mono text-[10px] font-semibold text-warn">due in {t.days_left}d</span>
                  ) : (
                    <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] text-ink-500">due {t.due_on}</span>
                  )
                ) : null}
              </div>
              {t.detail ? <p className="mt-0.5 text-[12px] text-ink-500">{t.detail}</p> : null}
              {t.assignee ? <p className="mt-0.5 text-[11.5px] text-ink-500">assigned to {t.assignee}</p> : null}
            </div>
            {t.source_link ? (
              <Link href={t.source_link} className="text-[12.5px] font-semibold text-pine-700 underline decoration-pine-300 underline-offset-4 hover:decoration-pine-700">
                Open
                <ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" />
              </Link>
            ) : null}
            {canEdit ? (
              <div className="flex gap-2">
                <Button variant="secondary" disabled={pending} onClick={() => complete(t, "done")}>Done</Button>
                <Button variant="ghost" disabled={pending} onClick={() => complete(t, "cancelled")}>Drop</Button>
              </div>
            ) : null}
          </div>
        ))}
        {open.length === 0 ? <p className="py-6 text-center text-[13px] text-ink-500">No open tasks. Enjoy the quiet.</p> : null}
      </div>

      <TaskForm staff={staff} canEdit={canEdit} />

      {done.length > 0 ? (
        <div className="mt-4 border-t border-paper-200 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Done this week</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {done.map((t) => (
              <span key={t.id} className="rounded-pill bg-pine-50 px-3 py-1 text-[12px] text-pine-800 line-through">{t.title}</span>
            ))}
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-[12.5px] text-ink-700" role="status">{msg}</p> : null}
    </Card>
  );
}

function TaskForm({ staff, canEdit }: { staff: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!canEdit) return null;

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2 border-t border-paper-200 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const fd = new FormData(f);
        start(async () => {
          const r = await createTaskAction({
            title: String(fd.get("title") ?? ""),
            detail: String(fd.get("detail") ?? "") || undefined,
            assigneeId: String(fd.get("assigneeId") ?? "") || undefined,
            dueOn: String(fd.get("dueOn") ?? "") || undefined,
          });
          if (r.ok) {
            f.reset();
            setMsg("Task added");
            router.refresh();
          } else {
            setMsg(r.error ?? "Failed");
          }
        });
      }}
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">New task *</span>
        <input name="title" required minLength={3} maxLength={160} placeholder="e.g. Call the four overdue families" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Assignee</span>
        <select name="assigneeId" className="h-10 min-w-[140px] rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950">
          <option value="">Anyone</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Due</span>
        <input name="dueOn" type="date" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>Add task</Button>
      {msg ? <span className="text-[12px] text-ink-500">{msg}</span> : null}
    </form>
  );
}
