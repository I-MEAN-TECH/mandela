"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { setMediaConsentAction, type MediaConsentRow } from "@/lib/api";

export function ConsentDesk({ rows }: { rows: MediaConsentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");

  const shown = rows.filter((x) => x.learner.toLowerCase().includes(q.toLowerCase()) || x.guardian.toLowerCase().includes(q.toLowerCase()));

  function decide(x: MediaConsentRow, choice: "granted" | "declined") {
    start(async () => {
      const r = await setMediaConsentAction({ guardianId: x.guardian_id, learnerId: x.learner_id, choice });
      setMsg(r.ok ? { ok: true, text: `${x.learner} (${x.guardian}): ${choice}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Consent ledger"
        sub="One row per guardian + learner · leaders record the decision"
        action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-44 rounded-pill border border-paper-300 bg-surface px-3.5 text-[13px] outline-none focus:border-primary" />}
      />
      <div className="flex max-h-[460px] flex-col divide-y divide-paper-200 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No guardian-learner pairs match.</p>
        ) : shown.map((x) => (
          <div key={`${x.learner_id}-${x.guardian_id}`} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-[180px] flex-1">
              <p className="text-[13px] font-semibold text-ink-950">{x.learner}</p>
              <p className="text-[11.5px] text-muted">{x.guardian} · {x.phone}{x.class_name ? ` · ${x.class_name}` : ""}</p>
            </div>
            <StatusPill tone={x.state === "granted" ? "ok" : x.state === "declined" ? "warn" : "neutral"}>
              {x.state === "granted" ? "Granted" : x.state === "declined" ? "Declined" : "Not asked"}
            </StatusPill>
            <div className="flex gap-1.5">
              {x.state !== "granted" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(x, "granted")}>Grant</Button> : null}
              {x.state !== "declined" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(x, "declined")}>Decline</Button> : null}
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className={`border-t border-paper-200 px-4 py-2.5 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p> : null}
    </Card>
  );
}
