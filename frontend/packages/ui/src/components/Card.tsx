import { cn } from "../cn";

/**
 * Card — the reference's surface: white, 16px radius, sage hairline,
 * barely-there shadow. Flat color only — depth is hairline + space.
 */
export function Card({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      data-card=""
      className={cn(
        // The alive surface: a 2px lift + deeper shadow on hover — flat at
        // rest like the comp, responsive to the hand. Reduced motion: none.
        "rounded border border-border bg-surface p-s5 shadow-1 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:shadow-2 motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-1 motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * CardHead — the reference's card header: Poppins 18px semibold title +
 * quiet sub, optional right action.
 */
export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-s4 flex items-start justify-between gap-s3">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink-950">{title}</h2>
        {sub ? <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{sub}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** CardTitle — legacy API (uppercase micro title). Kept for older screens. */
export function CardTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-s4 flex items-center justify-between">
      <h2 className="microlabel">{title}</h2>
      {action}
    </header>
  );
}

/**
 * Money — ALWAYS integer cents in, formatted once. Never floats in UI.
 * Mirrors backend schema: money is bigint cents serialized as string.
 */
export function Money({ cents, className }: { cents: number | bigint | string; className?: string }) {
  const raw = typeof cents === "string" ? Number(cents) : Number(cents);
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
    throw new Error(`Money: expected integer cents, got ${String(cents)}`);
  }
  const value = raw / 100;
  const formatted = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
  return <span className={cn("tabular-nums", className)}>{formatted}</span>;
}

export type StatusTone = "ok" | "warn" | "danger" | "neutral";

const tones: Record<StatusTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-paper-100 text-muted",
};

/** StatusPill — paid / partial / due / overdue states, colorblind-safe (icon + text). */
export function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const icon = tone === "ok" ? "✓" : tone === "warn" ? "!" : tone === "danger" ? "✕" : "•";
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-semibold", tones[tone])}
      aria-label={String(children)}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </span>
  );
}

/** Microlabel — mono uppercase tracked label. */
export function Microlabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("microlabel", className)}>{children}</p>;
}
