import Link from "next/link";
import { appLinks } from "@/lib/appLinks";

/**
 * The three doors — the same entry ritual as the product's /register:
 * parents go to login (phone OTP), the two staff doors go to /register.
 */
export function Doors({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
      <Link
        href={appLinks.register}
        className="flex min-h-[84px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 text-left transition-all hover:-translate-y-px hover:bg-paper-50 hover:shadow-1"
      >
        <span>
          <span className="block text-[15px] font-semibold text-ink-950">I work at a school</span>
          {!compact && <span className="mt-0.5 block text-[12.5px] text-muted">Join with your school&apos;s code</span>}
        </span>
        <span aria-hidden className="text-primary">→</span>
      </Link>
      <Link
        href={appLinks.registerSchool}
        className="flex min-h-[84px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 text-left transition-all hover:-translate-y-px hover:bg-paper-50 hover:shadow-1"
      >
        <span>
          <span className="block text-[15px] font-semibold text-ink-950">I run a school</span>
          {!compact && <span className="mt-0.5 block text-[12.5px] text-muted">Set up the school and invite your staff</span>}
        </span>
        <span aria-hidden className="text-primary">→</span>
      </Link>
    </div>
  );
}
