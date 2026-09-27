"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * TwinLinks — the seam between merged modules. When two or three small
 * screens share one sidebar door (Fees/Levies/Pocket, Hostel/Mess,
 * Infirmary/Security, Flags/Integrations, Exams/Entries), each page opens
 * with this segmented row: same place, every screen, one tap to the twin.
 * The sidebar stays calm; the relationship lives at the point of use.
 */
export function TwinLinks({ label, twins }: { label: string; twins: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="mb-s3h flex flex-wrap items-center gap-1">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">{label}</span>
      {twins.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "location" : undefined}
            className={`inline-flex min-h-[36px] items-center rounded-pill border-2 px-3.5 text-xs font-semibold transition-colors ${
              active ? "border-primary bg-primary-soft text-primary" : "border-transparent bg-paper-100 text-ink-600 hover:bg-paper-200 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
