"use client";

import { useState, useTransition } from "react";
import { Button } from "@mandela/ui";

export function PayButtons({
  learnerId,
  balanceCents,
  action,
}: {
  learnerId: string;
  balanceCents: number;
  action: (input: { learnerId: string; amountCents: number; method: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pay(amountCents: number) {
    start(async () => {
      const res = await action({ learnerId, amountCents, method: "mpesa" });
      setMsg(res.ok ? "Payment received — receipt on its way — done" : (res.error ?? "Payment failed"));
    });
  }

  return (
    <div className="mt-s3 flex flex-wrap items-center gap-s3">
      <Button variant="primary" size="lg" onClick={() => pay(balanceCents)} disabled={pending}>
        {pending ? "Processing…" : `Pay full — KES ${(balanceCents / 100).toLocaleString("en-KE")}`}
      </Button>
      <Button variant="secondary" size="lg" onClick={() => pay(Math.round(balanceCents / 2))} disabled={pending}>
        Pay half
      </Button>
      {msg ? (
        <span className={`text-sm ${msg.endsWith(" — done") ? "text-ok" : "text-danger"}`} role="status">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
