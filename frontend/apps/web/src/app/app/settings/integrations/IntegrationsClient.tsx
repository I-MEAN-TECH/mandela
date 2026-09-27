"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { toggleIntegrationAction, type IntegrationsData } from "@/lib/api";

/**
 * Integrations 36 — connection health for the school's rails. SECRETS STAY
 * PLATFORM-SIDE, never in the school DB — this screen shows status and
 * toggles, nothing else (the spec's hard line).
 */
export function IntegrationsBoard({ rows, isAdmin }: {
  rows: IntegrationsData["rows"];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Connections"
        sub="Status only — credentials live in the platform control plane, never in your school's database."
      />
      {msg ? (
        <p role="status" className={`px-s5 pb-s2 text-[12.5px] font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      <div className="flex flex-col divide-y divide-paper-200">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[200px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-ink-950">{r.label}</p>
                <StatusPill tone={r.connected ? "ok" : "neutral"}>{r.connected ? "connected" : "not connected"}</StatusPill>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {r.note ?? "—"}{r.last_ok_at ? ` · last OK ${r.last_ok_at.slice(0, 16).replace("T", " ")}` : ""}
              </p>
            </div>
            {isAdmin ? (
              <Button
                variant={r.connected ? "ghost" : "secondary"}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await toggleIntegrationAction({ key: r.key, connected: !r.connected });
                    setMsg(
                      res && "error" in res
                        ? { ok: false, text: res.error ?? "Could not update the connection." }
                        : { ok: true, text: `${r.label} ${r.connected ? "disconnected" : "marked connected"} — audited.` },
                    );
                    router.refresh();
                  })
                }
              >
                {r.connected ? "Disconnect" : "Mark connected"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
