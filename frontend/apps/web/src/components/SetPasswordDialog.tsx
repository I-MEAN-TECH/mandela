"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { setMyPasswordAction } from "@/lib/api";

/**
 * SetPasswordDialog — the account menu's "Set password" flow. Self-service:
 * any staff member sets or replaces their own password. The write is
 * audited server-side (`staff.password.set`).
 */
export function SetPasswordDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setErr(null);
    if (a.length < 8) return setErr("Password must be at least 8 characters.");
    if (!/[a-zA-Z]/.test(a) || !/\d/.test(a)) return setErr("Password needs letters and numbers.");
    if (a !== b) return setErr("The two passwords don't match.");
    setPending(true);
    const res = await setMyPasswordAction({ password: a });
    setPending(false);
    if (res && "error" in res && res.error) return setErr(res.error);
    setOk(true);
    setTimeout(() => {
      onClose();
      router.refresh();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label="Set your password">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <div className="relative w-full max-w-sm overflow-hidden rounded border border-border bg-surface p-s5 shadow-2">
        <p className="font-display text-[17px] font-semibold text-ink-950">Set your password</p>
        {ok ? (
          <p className="mt-3 text-[13.5px] text-ok" role="status">
            Saved — your password is set. Next sign-in needs it.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              At least 8 characters, letters and numbers. You'll type it on every sign-in.
            </p>
            <label className="mt-4 block text-[13px] font-semibold text-ink-900">
              New password
              <input
                type="password"
                value={a}
                onChange={(e) => setA(e.target.value)}
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-sm focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100"
              />
            </label>
            <label className="mt-3 block text-[13px] font-semibold text-ink-900">
              Repeat it
              <input
                type="password"
                value={b}
                onChange={(e) => setB(e.target.value)}
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-sm focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100"
              />
            </label>
            {err ? (
              <p className="mt-3 text-[13px] font-semibold text-danger" role="alert">
                {err}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} loading={pending}>
                Save password
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
