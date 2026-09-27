"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { redeemLinkCodeAction } from "@/lib/api";

/**
 * LinkChildCard — the guardian-side redeem of the one-time admission code
 * (Phase 3). Shown on the profile page when no children are linked yet.
 * After a successful redeem the child appears on the next sign-in (the
 * home feed reads learner_guardian live, the session caches nothing).
 */
export function LinkChildCard({ onLinked }: { onLinked?: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function redeem() {
    setPending(true);
    setErr(null);
    const r = await redeemLinkCodeAction(code);
    setPending(false);
    if (!r.ok) return setErr(r.error ?? "That code did not match.");
    setMsg(`${r.learner ?? "Your child"} is linked — they appear on your home screen now.`);
    onLinked?.();
    router.refresh();
  }

  return (
    <div className="mt-s3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="profile-link-code">Family link code</label>
        <input
          id="profile-link-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ML-XXXXXXXX"
          autoComplete="off"
          className="h-11 w-44 rounded-sm border border-border bg-surface px-3 font-mono text-[13px] uppercase tracking-wider text-ink-950 placeholder:text-muted"
        />
        <Button size="sm" onClick={redeem} disabled={pending || code.trim().length < 4}>
          {pending ? "Checking…" : "Link"}
        </Button>
      </div>
      {msg ? <p className="text-[13px] text-ok" role="status">{msg}</p> : null}
      {err ? <p className="text-[13px] text-danger" role="alert">{err}</p> : null}
    </div>
  );
}
