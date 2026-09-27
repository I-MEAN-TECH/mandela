"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { setRetentionPolicyAction, type RetentionPolicyData } from "@/lib/api";

/**
 * Retention & Backups — the ㊲-parked DECISION made editable (flank #8).
 * Audit stays forever (the tamper-evident trail is the product's spine);
 * the school documents its backup regime and export window — a recorded
 * decision, not a silent default. Every change audited.
 */
export function RetentionPolicyCard({ initial, canEdit }: { initial: RetentionPolicyData; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backups, setBackups] = useState(initial.backups);
  const [days, setDays] = useState(String(initial.export_window_days));

  return (
    <Card>
      <CardHead
        title="Data retention & backups"
        sub="The documented policy (flank #8). Audit history is permanent by design — it is the tamper-evident spine."
        action={canEdit ? <StatusPill tone="ok">you can edit</StatusPill> : <StatusPill tone="neutral">read-only</StatusPill>}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-sm border border-paper-200 bg-paper-50 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Audit trail</p>
          <p className="mt-1 text-[14px] font-semibold text-ink-950">Kept forever</p>
          <p className="mt-0.5 text-[12px] text-ink-500">Every write in the system is attributable — never trimmed.</p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Backup regime (documented)</span>
          <input
            value={backups}
            onChange={(e) => setBackups(e.target.value)}
            disabled={!canEdit || pending}
            maxLength={300}
            className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950 disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">One-click export window (days)</span>
          <input
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
            disabled={!canEdit || pending}
            inputMode="numeric"
            className="h-10 max-w-[180px] rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950 disabled:opacity-60"
          />
          <span className="text-[11.5px] text-ink-500">30 – 36,500 days. The export button ships with the Vault (Phase 3).</span>
        </label>
      </div>
      {canEdit ? (
        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={pending || backups.trim().length < 4 || !days}
            onClick={() =>
              start(async () => {
                const r = await setRetentionPolicyAction({ backups: backups.trim(), exportWindowDays: Number(days) });
                setMsg(r.ok ? { ok: true, text: "Policy recorded" } : { ok: false, text: r.error ?? "Failed" });
                if (r.ok) router.refresh();
              })
            }
          >
            Record decision
          </Button>
          {msg ? <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
