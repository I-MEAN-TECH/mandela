"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePrincipalHatAction } from "@/lib/api";

/**
 * PrincipalHatToggle — §6.1: "If the admin holds the Principal hat, a
 * Principal view toggle surfaces the §6.2 sections inside this same Pulse —
 * one account, both worlds." Toggling writes staff_duty (duty_key 'principal')
 * via the API; router.refresh() re-renders the Pulse with/without the
 * PrincipalSections card.
 */
export function PrincipalHatToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function flip() {
    const next = !checked;
    setBusy(true);
    const r = await togglePrincipalHatAction(next);
    setBusy(false);
    if (r.ok) {
      setChecked(next);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex items-center justify-between gap-s3 rounded-sm border border-border bg-surface px-s3 py-s2">
      <div>
        <p className="microlabel">PRINCIPAL VIEW</p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {checked
            ? "The §6.2 sections are on this Pulse."
            : "Show the §6.2 sections on this Pulse."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Toggle Principal view"
        disabled={busy || pending}
        onClick={flip}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
          checked ? "border-primary bg-primary" : "border-border bg-paper-100"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
