"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBellState, type BellState } from "@/lib/api";
import { cn } from "@mandela/ui";

/**
 * BellMenu — the topbar's LIVE bell: counts come from the database
 * (pending payments, this week's announcements + audit entries), the red
 * dot only exists when work is actually waiting, and opening it shows the
 * real breakdown with links. Refreshes every 60s. No hardcoded dot.
 */

const ROWS: {
  key: keyof BellState;
  label: string;
  href: string;
  work: boolean;
  tone: string;
}[] = [
  { key: "pending_payments", label: "Payments waiting to be confirmed", href: "/app/reconcile", work: true, tone: "text-warn" },
  { key: "announcements_7d", label: "Announcements sent this week", href: "/app/broadcast", work: false, tone: "text-ink-700" },
  { key: "audit_7d", label: "Recorded actions this week", href: "/app/settings", work: false, tone: "text-ink-700" },
];

export function BellMenu() {
  const [state, setState] = useState<BellState | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      const s = await getBellState();
      if (alive && s) setState(s);
    }
    tick();
    const iv = window.setInterval(tick, 60_000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const waiting = (state?.pending_payments ?? 0) > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={
          waiting
            ? `Notifications — ${state?.pending_payments} ${state?.pending_payments === 1 ? "payment" : "payments"} waiting`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative grid h-11 w-11 place-items-center rounded-full bg-paper-100 text-ink-700 transition-colors hover:bg-paper-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {/* The dot is TRUE: only when money is waiting on a decision. */}
        {waiting ? (
          <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[52px] z-50 w-[320px] overflow-hidden rounded border border-border bg-surface shadow-2">
          <p className="microlabel px-4 pb-1 pt-3.5 !mb-0">This week at the school</p>
          <ul className="pb-1.5">
            {ROWS.map((r) => {
              const v = state ? state[r.key] : null;
              return (
                <li key={r.key}>
                  <Link
                    href={r.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-paper-50"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-900">{r.label}</span>
                    <span className={cn("numeral shrink-0 text-[13px] font-bold", v === null ? "text-ink-300" : r.work && v > 0 ? r.tone : "text-ink-950")}>
                      {v === null ? "…" : v}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
