"use client";

import { useState, useTransition } from "react";
import { Button } from "@mandela/ui";

export function ConfirmButtons({
  receiptNo,
  action,
}: {
  receiptNo: string;
  action: (input: { receiptNo: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    start(async () => {
      const res = await action({ receiptNo });
      setMsg(res.ok ? "Confirmed — done" : (res.error ?? "Failed"));
    });
  }

  if (msg?.includes("done")) {
    return <span className="text-sm font-semibold text-ok" role="status">{msg}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" size="sm" onClick={confirm} disabled={pending}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      {msg ? <span className="text-xs font-semibold text-danger">{msg}</span> : null}
    </div>
  );
}
