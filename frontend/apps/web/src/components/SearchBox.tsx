"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { schoolSearch, type SearchHit } from "@/lib/api";
import { cn } from "@mandela/ui";
import { ArrowRight } from "lucide-react";

/**
 * SearchBox — the topbar's LIVE search: debounced school-wide query
 * (learners · staff · guardians · receipts), grouped results dropdown,
 * keyboard-friendly (Escape closes, focus opens). Every hit links to the
 * page where that record lives. No placeholder fakery.
 */

const KIND_STYLE: Record<SearchHit["kind"], string> = {
  learner: "bg-pine-100 text-pine-800",
  staff: "bg-lime-100 text-pine-800",
  guardian: "bg-paper-200 text-ink-700",
  receipt: "bg-ok-bg text-ok",
};

export function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
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

  // Debounced live search — 250ms after the last keystroke.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(async () => {
      const r = await schoolSearch(term);
      setHits(r);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative hidden min-w-0 max-w-[220px] flex-1 sm:block">
      <label className="relative block">
        <span className="sr-only">Search learners, staff, guardians, receipts</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search the school…"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
          className="h-11 w-full rounded-pill border border-paper-200 bg-ambient-panel pl-4 pr-10 text-[13px] text-text placeholder:text-ink-400 focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100"
        />
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2",
            loading ? "animate-spin text-pine-600" : "text-ink-500",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden
        >
          {loading ? (
            <path d="M21 12a9 9 0 1 1-9-9" />
          ) : (
            <>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </>
          )}
        </svg>
      </label>

      {showPanel ? (
        <div
          id="search-results"
          role="listbox"
          className="absolute right-0 top-[52px] z-50 w-[360px] overflow-hidden rounded border border-border bg-surface shadow-2"
        >
          {hits === null ? null : hits.length === 0 ? (
            <p className="px-4 py-5 text-center text-[12.5px] text-muted">
              Nothing matches “{q.trim()}” in this school.
            </p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto py-1.5">
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.label}-${i}`} role="option" aria-selected={false}>
                  <Link
                    href={h.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper-50 focus-visible:bg-paper-50 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "grid h-7 shrink-0 place-items-center rounded-sm px-2 text-[10px] font-bold uppercase tracking-[0.06em]",
                        KIND_STYLE[h.kind],
                      )}
                    >
                      {h.kind}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink-950">{h.label}</span>
                      <span className="block truncate text-[11px] text-muted">{h.meta}</span>
                    </span>
                    <span aria-hidden>
                      <ArrowRight size={14} strokeWidth={2} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
