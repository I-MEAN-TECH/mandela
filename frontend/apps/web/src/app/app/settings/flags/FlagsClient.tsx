"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, StatusPill } from "@mandela/ui";
import { setFlagAction, type FeatureFlagRow } from "@/lib/api";

/**
 * Capability flags (docs/MASTER-CHECKLIST.md calm-IA) — the admin turns a
 * desk on/off; the school only sees what it uses. Nav visibility reads these
 * on next load.
 */
export function FlagsClient({ rows, isAdmin }: { rows: FeatureFlagRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (key: string, enabled: boolean) => {
    start(async () => {
      const r = await setFlagAction({ key, enabled });
      setMsg(
        r && "error" in r
          ? { ok: false, text: r.error ?? "Could not update the desk." }
          : { ok: true, text: `${key} ${enabled ? "on" : "off"} — audited; nav updates on next load.` },
      );
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHead
        title="Desks this school uses"
        sub="A school without buses never sees Transport. Toggle a capability and its group appears (or disappears) for every staff account."
      />
      {msg ? (
        <p role="status" className={`px-s5 pb-s2 text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
        {rows.map((f) => (
          <div key={f.key} className="flex items-center justify-between py-2.5 text-sm">
            <span>
              <span className="font-medium text-text">{f.label}</span>
              <span className="ml-s2 text-xs text-muted">{f.group_key}</span>
            </span>
            {isAdmin ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(f.key, !f.enabled)}
                className="text-xs text-muted underline decoration-border underline-offset-4 hover:text-text"
              >
                {f.enabled ? "turn off" : "turn on"}
              </button>
            ) : (
              <StatusPill tone={f.enabled ? "ok" : "neutral"}>{f.enabled ? "on" : "off"}</StatusPill>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
