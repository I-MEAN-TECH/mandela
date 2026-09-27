"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";

/**
 * ViewMode — system-completion follow-up: every section's tables and lists
 * can be read as Cards (the designed surfaces) or as a compact List (a
 * ledger: hairline rows, tight gaps). The choice is the USER's, per app
 * section (Money, People, Academics… — the first two path segments), and
 * persists in localStorage.
 *
 * Three parts that MUST stay behaviorally in sync:
 *  · `viewBootstrapScript` (below) — inlined in the root layout so a
 *    preferred list view applies BEFORE first paint (no flash of cards).
 *  · `ViewToggle` — the control; re-applies the stored mode on every
 *    client navigation (the <main> element survives route changes).
 *  · the CSS layer in the app's globals.css under `main[data-view="list"]`.
 *
 * The ui package stays dependency-free: inline SVG glyphs, no next import
 * (scope comes in as a prop), storage only.
 */

export type ViewMode = "cards" | "list";

const VIEW_KEY = "mandela_view";

/** The persistence scope for a pathname: its first two segments ("/money/fees" → "/money"). */
export function viewScopeOf(pathname: string): string {
  const seg = pathname.split("?")[0]!.split("/").filter(Boolean);
  return "/" + seg.slice(0, 2).join("/");
}

/** Stored mode for a scope; anything unknown reads as "cards". */
export function readStoredView(scope: string): ViewMode {
  try {
    const all = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") as Record<string, unknown>;
    return all[scope] === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function applyView(scope: string, mode: ViewMode) {
  const main = document.querySelector("main");
  if (!main) return;
  main.setAttribute("data-view", mode);
  main.setAttribute("data-viewscope", scope);
}

/**
 * Pre-paint applier — a plain-JS string the app inlines at the end of
 * <body> in its root layout. Runs after the streamed <main> exists and
 * before the user sees the page.
 */
export const viewBootstrapScript = `(function(){try{var K="mandela_view";function sc(p){var s=p.split("?")[0].split("/").filter(Boolean);return"/"+s.slice(0,2).join("/")}var a=null;try{a=JSON.parse(localStorage.getItem(K)||"null")}catch(e){}var m=document.querySelector("main");if(!m||!a)return;var g=sc(location.pathname);if(a[g]==="list"){m.setAttribute("data-view","list");m.setAttribute("data-viewscope",g)}}catch(e){}})()`;

/** Tiny inline glyphs — the ui package has no icon dependency. */
function CardsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth={2.5} />
    </svg>
  );
}

/**
 * ViewToggle — the topbar segmented control (Cards ⇄ List). `scope` is the
 * app section (viewScopeOf of the current pathname) owned by the shell.
 */
export function ViewToggle({ scope }: { scope: string }) {
  const [mode, setMode] = useState<ViewMode>("cards");
  const [ready, setReady] = useState(false);

  // Re-read + re-apply on every section change (client navs keep <main> alive).
  useEffect(() => {
    const stored = readStoredView(scope);
    setMode(stored);
    applyView(scope, stored);
    setReady(true);
  }, [scope]);

  // Follow other tabs' choices.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== VIEW_KEY) return;
      const stored = readStoredView(scope);
      setMode(stored);
      applyView(scope, stored);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  function choose(next: ViewMode) {
    setMode(next);
    try {
      const all = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") as Record<string, unknown>;
      all[scope] = next;
      localStorage.setItem(VIEW_KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable — the toggle still applies for this page view */
    }
    applyView(scope, next);
    window.dispatchEvent(new CustomEvent("mandela-view", { detail: { scope, mode: next } }));
  }

  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn("flex shrink-0 items-center rounded-pill border border-paper-200 bg-ambient-panel p-0.5 transition-opacity", !ready && "opacity-0")}
    >
      <button
        type="button"
        aria-pressed={mode === "cards"}
        title="Card view"
        onClick={() => choose("cards")}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500",
          mode === "cards" ? "bg-surface text-ink-950 shadow-1" : "text-ink-500 hover:text-ink-900",
        )}
      >
        <CardsGlyph />
        <span className="hidden sm:inline">Cards</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "list"}
        title="List view — compact ledger"
        onClick={() => choose("list")}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500",
          mode === "list" ? "bg-surface text-ink-950 shadow-1" : "text-ink-500 hover:text-ink-900",
        )}
      >
        <ListGlyph />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}
