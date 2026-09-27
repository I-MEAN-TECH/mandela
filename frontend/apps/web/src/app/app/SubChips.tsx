"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, LayoutGrid, X } from "lucide-react";
import { NAV_CHILDREN, CHILD_ICONS } from "./navModules";

/**
 * SubChips — the narrow-screen home of the sub-modules. The sidebar
 * accordion needs md+ width (the rail is icon-only below it), but the
 * 3-tap rule still binds: every module ≤3 taps on a phone. Rendered once
 * above <main>, it shows a quiet "More" bar carrying the current location;
 * tapping it opens a bottom sheet listing the active parent's modules with
 * their real glyphs. Hidden from md up (the sidebar owns it there).
 */
export function SubChips() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hash, setHash] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLButtonElement>(null);

  // Anchor children are only "active" when their hash is too (same rule as
  // the sidebar) — otherwise every section of the page lights up at once.
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Sheet lifecycle: focus lands on Close, Escape dismisses, the page
  // behind stays put, and focus parks back on the bar when it closes.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      barRef.current?.focus();
    };
  }, [open]);

  const entry = Object.entries(NAV_CHILDREN).find(([, children]) =>
    children.some((c) => c.href.split("#")[0] === pathname),
  );
  if (!entry) return null;
  const [parent, children] = entry;

  const activeChild = children.find((c) => {
    const [, cHash] = c.href.split("#");
    return c.href.split("#")[0] === pathname && (!cHash || hash === `#${cHash}`);
  });

  return (
    <div className="md:hidden">
      {/* The bar — where am I, and what else lives in this module */}
      <button
        ref={barRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="mb-4 flex w-full items-center justify-between gap-2 rounded border border-border bg-surface px-3.5 py-2.5 text-left shadow-1 transition-colors hover:border-paper-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500"
      >
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-900">
          <LayoutGrid size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-primary" />
          <span className="truncate">
            {parent}
            {activeChild ? <span className="font-normal text-muted"> · {activeChild.label}</span> : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary">
          More
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${parent} modules`}>
          {/* Backdrop — dim and dismiss */}
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-ink-950/40"
          />
          {/* The sheet — slides from the bottom edge, rounds to meet the screen */}
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 overflow-hidden rounded-t-lg border-t border-border bg-surface shadow-2">
            <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3.5">
              <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-pill bg-paper-300" />
              <p className="microlabel pt-1">{parent}</p>
              <button
                ref={closeRef}
                onClick={() => setOpen(false)}
                aria-label="Close modules menu"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-pill text-ink-500 transition-colors hover:bg-paper-100 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500"
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
              {children.map((c) => {
                const [, cHash] = c.href.split("#");
                const active = c.href.split("#")[0] === pathname && (!cHash || hash === `#${cHash}`);
                return (
                  <li key={c.href}>
                    <Link
                      href={c.href}
                      aria-current={active ? "location" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-w-0 items-center gap-3 rounded-sm px-2.5 py-2.5 transition-colors ${
                        active ? "bg-primary-soft text-primary" : "text-ink-800 hover:bg-paper-50"
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-sm ${
                          active ? "bg-primary-soft text-primary" : "bg-paper-100 text-ink-600"
                        }`}
                      >
                        {CHILD_ICONS[c.label] ?? <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{c.label}</span>
                      {active ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
