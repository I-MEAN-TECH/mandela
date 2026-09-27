"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@mandela/ui";
import { SetPasswordDialog } from "./SetPasswordDialog";

/**
 * ProfileMenu — the top-right avatar is a real control: click opens the
 * account menu (initials avatar, name/role, links, sign-out). Same pattern
 * as the bell: outside-click and Escape close it. Reuses the session props
 * the shell already has — no extra fetches.
 */
export function ProfileMenu({ name, meta }: { name: string; meta: string }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2.5">
      {/* Name block: capped width + truncate so it can never crowd the
          avatar, whatever the name's length or the viewport. */}
      <span className="hidden min-w-0 max-w-[170px] text-right sm:block">
        <span className="block truncate text-[13.5px] font-semibold text-ink-950">{name}</span>
        <span className="block truncate text-[11px] text-ink-500">{meta}</span>
      </span>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          // Same 44px circle as the bell — no resting ring, or the avatar
          // reads larger than its neighbours. Ring appears on hover/open only.
          "grid h-11 w-11 place-items-center rounded-full bg-lime-100 text-[12.5px] font-bold text-pine-800 transition-all",
          "hover:ring-2 hover:ring-lime-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-500",
          open && "ring-2 ring-lime-400 shadow-glow",
        )}
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[54px] z-50 w-[240px] overflow-hidden rounded border border-border bg-surface shadow-2"
        >
          <div className="border-b border-paper-200 px-4 pb-3 pt-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-lime-100 text-[11.5px] font-bold text-pine-800">{initials}</span>
            <p className="mt-2 truncate text-[13px] font-semibold text-ink-950">{name}</p>
            <p className="truncate text-[11px] text-ink-500">{meta}</p>
          </div>
          <div className="py-1.5">
            <Link
              href="/app/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-ink-900 transition-colors hover:bg-paper-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
              </svg>
              My profile
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPwOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-ink-900 transition-colors hover:bg-paper-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Set password
            </button>
            <button
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-danger transition-colors hover:bg-danger-bg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      {pwOpen ? <SetPasswordDialog onClose={() => setPwOpen(false)} /> : null}
    </div>
  );
}
