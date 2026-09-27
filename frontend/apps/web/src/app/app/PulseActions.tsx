"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHead, EmptyState, StatusPill } from "@mandela/ui";
import { decideApprovalAction, completeTaskAction, type PulseApproval, type PulseTask } from "@/lib/api";

/**
 * PulseActions — System completion C11 (§7 #2): the two leadership roles act
 * on the oldest approvals and nearest tasks without leaving the Pulse. The
 * decision itself keeps its law: approvals demand a reason (any approval and
 * every rejection), tasks are one tap. List refreshes by router.refresh().
 */
export function PulseActions({ approvals, tasks }: { approvals: PulseApproval[]; tasks: PulseTask[] }) {
  const empty = approvals.length === 0 && tasks.length === 0;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    setErr(null);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      setReasons((r) => (id in r ? { ...r, [id]: "" } : r));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Needs you today" sub={empty ? "Nothing is waiting" : "Act here — the record keeps itself"} />
      {err ? <p className="mb-s2 text-sm font-semibold text-danger" role="alert">{err}</p> : null}
      {empty ? (
        <EmptyState title="Clear desk" body="No pending requests, no open tasks. The Pulse is yours to read." />
      ) : (
        <div className="grid gap-s3">
          {approvals.map((a) => (
            <div key={a.id} className="rounded-sm border border-border bg-paper-50 p-s3">
              <div className="flex items-start justify-between gap-s2">
                <p className="min-w-0 text-[13.5px] font-semibold">
                  {a.requester} — {a.request_type.replaceAll("-", " ")}
                </p>
                <StatusPill tone={a.age_days > 3 ? "warn" : "neutral"}>{a.age_days === 0 ? "today" : `${a.age_days}d`}</StatusPill>
              </div>
              {typeof (a.payload as { amount_cents?: number })?.amount_cents === "number" ? (
                <p className="mt-0.5 text-sm text-muted">Ksh {Number((a.payload as { amount_cents: number }).amount_cents).toLocaleString("en-KE")}</p>
              ) : null}
              <input
                value={reasons[a.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [a.id]: e.target.value }))}
                placeholder="Reason (required) — e.g. policy allows, receipts seen"
                maxLength={200}
                className="mt-s2 h-10 w-full rounded-sm border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-s2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy === a.id || (reasons[a.id] ?? "").trim().length < 4}
                  onClick={() =>
                    act(a.id, () => decideApprovalAction({ id: a.id, decision: "approved", reason: (reasons[a.id] ?? "").trim() }))
                  }
                  className="h-9 rounded-pill bg-primary px-4 text-xs font-semibold text-on-primary disabled:opacity-50"
                >
                  {busy === a.id ? "…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={busy === a.id || (reasons[a.id] ?? "").trim().length < 4}
                  onClick={() =>
                    act(a.id, () => decideApprovalAction({ id: a.id, decision: "rejected", reason: (reasons[a.id] ?? "").trim() }))
                  }
                  className="h-9 rounded-pill border border-border bg-surface px-4 text-xs font-semibold text-muted hover:text-text disabled:opacity-50"
                >
                  Reject
                </button>
                <Link href="/app/inbox" className="text-[12px] font-semibold text-pine-700 underline underline-offset-4">
                  All approvals
                </Link>
              </div>
            </div>
          ))}

          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-s2 rounded-sm border border-border bg-paper-50 px-s3 py-s2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{t.title}</p>
                <p className="text-[12px] text-muted">
                  {t.due_on
                    ? t.days_left !== null && t.days_left < 0
                      ? `overdue ${Math.abs(t.days_left)}d · was due ${t.due_on}`
                      : t.days_left === 0
                        ? "due today"
                        : `due ${t.due_on} · in ${t.days_left}d`
                    : "no due date"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => act(t.id, () => completeTaskAction({ id: t.id, state: "done" }))}
                className="h-9 shrink-0 rounded-pill border border-border bg-surface px-4 text-xs font-semibold text-muted hover:text-text disabled:opacity-50"
              >
                {busy === t.id ? "…" : "Done"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
