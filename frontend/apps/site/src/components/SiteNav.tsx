"use client";

import { appLinks } from "@/lib/appLinks";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangToggle } from "./LangToggle";

/**
 * Site nav — ≤6 items (Hick's Law applies to the front door too), a persistent
 * Sign in, and one lime Get started. Mobile: a drawer, 44px targets.
 */
const ITEMS = [
  { href: "/product", label: "Product" },
  { href: "/for-schools", label: "Schools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/stories", label: "Stories" },
  { href: "/about", label: "About" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-paper-300 bg-bg/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-s5" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <BrandMark className="h-7 w-7 text-ink-950" />
          <span className="display text-[17px] text-ink-950">Mandela</span>
        </Link>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={pathname === it.href ? "page" : undefined}
              className={`rounded-pill px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                pathname === it.href ? "bg-paper-100 text-ink-950" : "text-ink-700 hover:bg-paper-50"
              }`}
            >
              {it.label}
            </Link>
          ))}
          <span className="ml-2"><LangToggle compact /></span>
          <Link href={appLinks.login} className="rounded-pill px-3.5 py-2 text-[13.5px] font-semibold text-ink-700 hover:bg-paper-50">
            Sign in
          </Link>
          <Link
            href="/start"
            className="ml-1 inline-flex h-10 items-center rounded-pill bg-primary px-4.5 text-[13.5px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto grid h-11 w-11 place-items-center rounded-sm border border-paper-300 md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="grid gap-1">
            <span className={`block h-[2px] w-5 bg-ink-900 transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`} />
            <span className={`block h-[2px] w-5 bg-ink-900 transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] w-5 bg-ink-900 transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
          </span>
        </button>
      </nav>

      {open ? (
        <div className="border-t border-paper-300 bg-bg px-s5 pb-s5 pt-2 md:hidden">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center border-b border-paper-200 text-[15px] font-semibold text-ink-950 last:border-0"
            >
              {it.label}
            </Link>
          ))}
          <div className="mt-4 flex justify-center"><LangToggle /></div>
          <div className="mt-3 grid gap-2">
            <Link href="/start" onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-pill bg-primary font-semibold text-on-primary">
              Get started
            </Link>
            <Link href={appLinks.login} onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-pill border border-paper-300 font-semibold text-ink-900">
              Sign in
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** The brand mark (traced monochrome path) — inherits currentColor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Mandela">
      <path d="M33 27h2v2h-2zM59 27h2v2h-2zM57 28h1v1h-1zM33 29h1v1h-1zM60 29h1v1h-1zM34 31h1v1h-1zM59 31h1v1h-1zM32 32h1v1h-1zM60 32h1v1h-1zM31 33h1v1h-1zM61 33h1v1h-1zM31 34h1v1h-1zM61 34h1v1h-1zM30 35h1v1h-1zM62 35h1v1h-1zM30 36h1v1h-1zM62 36h1v1h-1zM29 37h1v1h-1zM63 37h1v1h-1zM29 38h1v1h-1zM63 38h1v1h-1zM29 39h1v1h-1zM63 39h1v1h-1zM28 40h1v1h-1zM64 40h1v1h-1zM28 41h1v1h-1zM64 41h1v1h-1zM28 42h1v1h-1zM64 42h1v1h-1zM28 43h1v1h-1zM64 43h1v1h-1zM27 44h1v1h-1zM65 44h1v1h-1zM27 45h1v1h-1zM65 45h1v1h-1zM27 46h1v1h-1zM65 46h1v1h-1zM27 47h1v1h-1zM65 47h1v1h-1zM27 48h1v1h-1zM65 48h1v1h-1zM27 49h1v1h-1zM65 49h1v1h-1zM27 50h1v1h-1zM65 50h1v1h-1zM27 51h1v1h-1zM65 51h1v1h-1zM27 52h1v1h-1zM65 52h1v1h-1zM28 53h1v1h-1zM64 53h1v1h-1zM28 54h1v1h-1zM64 54h1v1h-1zM28 55h1v1h-1zM64 55h1v1h-1zM29 56h1v1h-1zM63 56h1v1h-1zM29 57h1v1h-1zM63 57h1v1h-1zM30 58h1v1h-1zM62 58h1v1h-1zM30 59h1v1h-1zM62 59h1v1h-1zM31 60h1v1h-1zM61 60h1v1h-1zM31 61h1v1h-1zM61 61h1v1h-1zM32 62h1v1h-1zM60 62h1v1h-1zM32 63h1v1h-1zM60 63h1v1h-1zM33 64h1v1h-1zM59 64h1v1h-1zM34 65h1v1h-1zM58 65h1v1h-1zM34 66h1v1h-1zM58 66h1v1h-1zM35 67h1v1h-1zM57 67h1v1h-1zM36 68h1v1h-1zM56 68h1v1h-1zM37 69h1v1h-1zM55 69h1v1h-1zM38 70h1v1h-1zM54 70h1v1h-1zM39 71h1v1h-1zM53 71h1v1h-1zM40 72h1v1h-1zM52 72h1v1h-1zM41 73h1v1h-1zM51 73h1v1h-1zM43 74h1v1h-1zM49 74h1v1h-1zM44 75h1v1h-1zM48 75h1v1h-1z" fill="currentColor" />
    </svg>
  );
}
