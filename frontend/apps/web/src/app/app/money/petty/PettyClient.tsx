"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill } from "@mandela/ui";
import { decidePettyAction, recordPettyAction, upsertBudgetAction, type PettyData } from "@/lib/api";

/**
 * Petty Cash client ⑮ — record a top-up or a spend (bursar's two fields:
 * how much, for what), the decision queue for big spends, the recent
 * ledger, and budgets with honest progress bars.
 */

export function PettyClient({ data, canDecide, canRecord }: { data: PettyData; canDecide: boolean; canRecord: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <>
      {msg ? (
        <p role="status" className={`text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}

      {canRecord ? <RecordForm centers={data.centers} onDone={(t) => { setMsg({ ok: true, text: t }); router.refresh(); }} /> : null}

      {data.pending.length > 0 ? (
        <Card>
          <CardHead title="Awaiting decision" sub={canDecide ? "Spends above the threshold — approve or reject with a reason" : "Leaders decide these"} />
          <div className="flex flex-col divide-y divide-paper-200">
            {data.pending.map((t) => (
              <PendingRow key={t.id} row={t} canDecide={canDecide} onDone={(ok, text) => { setMsg({ ok, text }); router.refresh(); }} />
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-s4 xl:grid-cols-2">
        <Card>
          <CardHead title="Recent ledger" sub="The last 20 settled entries — every till movement with its reason" />
          {data.recent.length === 0 ? (
            <p className="px-s5 pb-s5 text-[13px] text-ink-500">No entries yet — record a top-up to open the till.</p>
          ) : (
            <div className="flex flex-col divide-y divide-paper-200">
              {data.recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-s5 py-s2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink-950">{t.description || "(no description)"}</p>
                    <p className="text-[12px] text-ink-500">{t.spent_on} · {t.cost_center}{t.raised_by ? ` · ${t.raised_by}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-[13px] font-semibold ${t.direction === "topup" ? "text-ok" : "text-ink-950"}`}>
                      {t.direction === "topup" ? "+" : "−"}<Money cents={Number(t.amount_cents)} className="text-[13px]" />
                    </span>
                    <StatusPill tone={t.state === "rejected" ? "danger" : "neutral"}>{t.state}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <BudgetCard budgets={data.budgets} centers={data.centers} canEdit={canDecide} onDone={(ok, text) => { setMsg({ ok, text }); router.refresh(); }} />
      </div>
    </>
  );
}

function RecordForm({ centers, onDone }: { centers: string[]; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [direction, setDirection] = useState<"topup" | "spend">("spend");
  const [shillings, setShillings] = useState("");
  const [costCenter, setCostCenter] = useState("general");
  const [description, setDescription] = useState("");

  const submit = () => {
    setErr(null);
    const n = Number(shillings);
    if (!Number.isFinite(n) || n <= 0) return setErr("Enter an amount in shillings.");
    if (description.trim().length < 3) return setErr("What was the money for? (3+ letters)");
    start(async () => {
      const r = await recordPettyAction({
        direction,
        amountCents: Math.round(n * 100),
        costCenter,
        description: description.trim(),
      });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      setOpen(false);
      setShillings(""); setDescription("");
      const needs = r && "needsApproval" in r && r.needsApproval;
      onDone(needs
        ? "Recorded — above the threshold, so it waits for a leader's decision."
        : `${direction === "topup" ? "Top-up" : "Spend"} recorded on the ledger.`);
    });
  };

  if (!open) {
    return (
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => { setDirection("spend"); setOpen(true); }}>Record a spend</Button>
        <Button variant="secondary" size="sm" onClick={() => { setDirection("topup"); setOpen(true); }}>Top up the float</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHead
        title={direction === "spend" ? "Record a spend" : "Top up the float"}
        sub={direction === "spend" ? "Above Ksh 200 it waits for a leader — below it lands straight on the ledger" : "Money in from the office — lands straight on the ledger"}
        action={<Button variant="ghost" size="sm2" onClick={() => setOpen(false)}>Close</Button>}
      />
      <form className="grid max-w-[520px] gap-s3 px-s5 pb-s5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div>
          <span className="mb-1 block text-[12px] font-semibold text-ink-700">Direction</span>
          <div className="flex gap-2">
            {([["spend", "Spend (out)"], ["topup", "Top-up (in)"]] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setDirection(v)}
                className={`h-10 rounded-pill px-4 text-[12.5px] font-semibold ${direction === v ? "bg-pine-700 text-white" : "border border-paper-300 text-ink-600 hover:bg-paper-100"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pc-amt">Amount (Ksh) *</label>
          <input id="pc-amt" inputMode="decimal" value={shillings} onChange={(e) => setShillings(e.target.value)} placeholder="e.g. 350" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pc-cc">Cost center</label>
          <select id="pc-cc" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]">
            {centers.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pc-why">What for *</label>
          <input id="pc-why" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Fresh milk, 10 litres" className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
        </div>
        {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Recording…" : "Record"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function PendingRow({ row, canDecide, onDone }: { row: PettyData["pending"][number]; canDecide: boolean; onDone: (ok: boolean, text: string) => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState<null | "approve" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);

  const decide = (approve: boolean) => {
    setErr(null);
    if ((approve ? reason : reason).trim().length < 4) return setErr("A reason is mandatory — it stays with the decision.");
    start(async () => {
      const r = await decidePettyAction({ id: row.id, approve, reason: reason.trim() });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      onDone(true, `Spend ${approve ? "approved" : "rejected"} — the reason is on the audit trail.`);
    });
  };

  return (
    <div className="px-s5 py-s3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <p className="text-[13.5px] font-semibold text-ink-950">{row.description || "(no description)"}</p>
          <p className="text-[12px] text-ink-500">{row.spent_on} · {row.cost_center}{row.raised_by ? ` · ${row.raised_by}` : ""}</p>
        </div>
        <Money cents={Number(row.amount_cents)} className="text-[14px] font-semibold" />
        {canDecide ? (
          <div className="flex gap-2">
            <Button size="sm2" variant="primary" disabled={pending} onClick={() => { setAskReason("approve"); }}>
              {askReason === "approve" ? "Confirm above" : "Approve…"}
            </Button>
            <Button size="sm2" variant="ghost" disabled={pending} onClick={() => setAskReason("reject")}>Reject…</Button>
          </div>
        ) : (
          <StatusPill tone="warn">pending</StatusPill>
        )}
      </div>
      {askReason ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={askReason === "approve" ? "e.g. Receipt on file, within budget" : "e.g. No receipt — ask the supplier first"}
            aria-label="Decision reason"
            className="h-9 min-w-[240px] flex-1 rounded-pill border border-paper-300 bg-surface px-3.5 text-[12.5px]"
          />
          <Button size="sm2" variant={askReason === "approve" ? "primary" : "ghost"} disabled={pending} onClick={() => decide(askReason === "approve")}>
            {pending ? "Deciding…" : askReason === "approve" ? "Confirm approve" : "Confirm reject"}
          </Button>
        </div>
      ) : null}
      {err ? <p className="mt-1 text-[12.5px] font-semibold text-danger">{err}</p> : null}
    </div>
  );
}

function BudgetCard({ budgets, centers, canEdit, onDone }: {
  budgets: PettyData["budgets"]; centers: string[]; canEdit: boolean;
  onDone: (ok: boolean, text: string) => void;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [costCenter, setCostCenter] = useState(centers[0] ?? "general");
  const [shillings, setShillings] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    const n = Number(shillings);
    if (!Number.isFinite(n) || n < 0) return setErr("Enter the budget in shillings.");
    start(async () => {
      const r = await upsertBudgetAction({ costCenter, budgetCents: Math.round(n * 100) });
      if (r && "error" in r && r.error) { setErr(r.error); return; }
      setEditing(false); setShillings("");
      onDone(true, `Budget for ${costCenter} set — actual now shows against it.`);
    });
  };

  return (
    <Card>
      <CardHead
        title="Term budgets — plan vs actual"
        sub="Set a budget per cost center; spends count against it live"
        action={canEdit ? (
          editing
            ? <Button variant="ghost" size="sm2" onClick={() => setEditing(false)}>Close</Button>
            : <Button variant="secondary" size="sm2" onClick={() => setEditing(true)}>Set budget</Button>
        ) : undefined}
      />
      {editing ? (
        <form className="mx-s5 mb-s3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pb-cc">Cost center</label>
            <select id="pb-cc" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13px]">
              {centers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="pb-amt">Budget (Ksh)</label>
            <input id="pb-amt" inputMode="decimal" value={shillings} onChange={(e) => setShillings(e.target.value)} placeholder="e.g. 20000" className="h-10 w-[140px] rounded-sm border border-paper-300 bg-surface px-3 text-[13px]" />
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending ? "Setting…" : "Set"}</Button>
          {err ? <p className="w-full text-[12.5px] font-semibold text-danger">{err}</p> : null}
        </form>
      ) : null}
      {budgets.length === 0 ? (
        <p className="px-s5 pb-s5 text-[13px] text-ink-500">No budgets yet — set one and spends count against it from today.</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200">
          {budgets.map((b) => {
            const pct = Number(b.budget_cents) > 0 ? Math.round((Number(b.spent_cents) / Number(b.budget_cents)) * 100) : 0;
            return (
              <div key={b.id} className="px-s5 py-s2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink-950">{b.cost_center}</p>
                  <p className="text-[12.5px] text-ink-600">
                    <Money cents={Number(b.spent_cents)} className="text-[12.5px]" /> of <Money cents={Number(b.budget_cents)} className="text-[12.5px]" /> · {pct}%
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-pill bg-paper-200">
                  <div
                    className={`h-1.5 rounded-pill ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
