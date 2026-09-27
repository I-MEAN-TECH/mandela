"use client";

import { useState } from "react";
import { Card, CardHead, Button, EmptyState } from "@mandela/ui";
import { getAiAnomaly, recordAiAnomalyAction } from "@/lib/api";

type Flag = {
  learner: string; learner_id: string; class_name: string | null;
  att_pct: number; arrears_cents: string; demerits_14d: number; why: string;
};

/**
 * AI assists — anomaly flag (flank #11). Draft-only: the flag exists to
 * prompt a human look, never an automatic decision. Recording it files a
 * draft (ai_draft, audited) — it never sends anything to anyone.
 */
export function AiAnomalyCard() {
  const [flag, setFlag] = useState<Flag | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function scan() {
    setBusy(true);
    setMsg(null);
    const r = await getAiAnomaly();
    setFlag(r && "flagged" in r ? r.flagged : null);
    setBusy(false);
  }

  async function fileDraft(f: Flag) {
    setBusy(true);
    const body = `Learner ${f.learner} (${f.class_name ?? "unassigned"}) shows: ${f.why}. Flagged for a welfare check — please look before acting.`;
    await recordAiAnomalyAction({ learnerId: f.learner_id, subject: `Anomaly: ${f.learner}`, body, params: { att_pct: f.att_pct, arrears_cents: f.arrears_cents, demerits_14d: f.demerits_14d } });
    setMsg("Filed as a draft — nobody was contacted. Follow up in Conduct or a call.");
    setBusy(false);
  }

  return (
    <Card>
      <CardHead
        title="One anomaly flag"
        sub="Draft-only assist — attendance + arrears + conduct, one learner to look at"
        action={<Button size="sm" variant="secondary" disabled={busy} onClick={scan}>{flag ? "Rescan" : "Scan today"}</Button>}
      />
      {!flag ? (
        msg ? (
          <p className="px-4 pb-4 text-[13px] font-semibold text-primary" role="status">{msg}</p>
        ) : (
          <p className="px-4 pb-4 text-[13px] text-muted">
            No flag filed yet. The scan reads aggregates only and writes nothing until a human files it.
          </p>
        )
      ) : (
        <div className="px-4 pb-4">
          <p className="text-[14px] font-semibold text-ink-950">{flag.learner} <span className="font-normal text-muted">· {flag.class_name ?? "—"}</span></p>
          <p className="mt-1 text-[13px] text-ink-700">{flag.why}</p>
          <div className="mt-2 flex gap-4 font-mono text-[11.5px] text-muted">
            <span>att {flag.att_pct}%</span>
            <span>arrears Ksh {(Number(flag.arrears_cents) / 100).toLocaleString()}</span>
            <span>{flag.demerits_14d} demerit{flag.demerits_14d === 1 ? "" : "s"}/14d</span>
          </div>
          {msg ? (
            <p className="mt-2.5 text-[13px] font-semibold text-primary" role="status">{msg}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => fileDraft(flag)}>File draft note</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setFlag(null); setMsg(null); }}>Not today</Button>
            </div>
          )}
        </div>
      )}
      {flag === null && !msg ? null : null}
    </Card>
  );
}
