import { cn } from "../cn";

/**
 * KpiCard — the reference's stat unit, two layouts:
 *
 *  · `icon` layout (the comp): icon in a sage well, delta chip, huge
 *    fluid numeral, label under. One per sector.
 *  · classic layout: label → numeral → note (+ meter/delta), used by the
 *    older screens; unchanged.
 *
 * `ink` renders the deep-green anchor card (one per screen). Numbers
 * shrink fluidly (text-num) so "Ksh 1,000,000" never spills its card.
 */
export function KpiCard({
  label,
  value,
  note,
  tone,
  ink,
  meter,
  delta,
  icon,
  action,
  className,
  children,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  tone?: "ok" | "danger" | "warn" | "neutral";
  ink?: boolean;
  meter?: { value: number; ok?: boolean }; // 0..100
  delta?: { text: string; tone: "ok" | "warn" | "danger" | "neutral" };
  /** Reference layout: icon rendered in a rounded sage well above the number. */
  icon?: React.ReactNode;
  /** Reference layout: quiet top-right action (⋯ menu slot). */
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const toneText =
    tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : undefined;

  if (icon) {
    return (
      <section
        data-kpi=""
        className={cn(
          "flex min-w-0 flex-col rounded border p-s5 shadow-1",
          ink ? "border-brand-deep bg-brand-deep text-brand-deep-contrast" : "border-border bg-surface",
          className,
        )}
      >
        <div className="flex items-start justify-between">
          <span
            aria-hidden
            className={cn(
              "grid h-11 w-11 place-items-center rounded-sm",
              ink ? "bg-white/10 text-lime-300" : "bg-paper-100 text-pine-700",
            )}
          >
            {icon}
          </span>
          {action ? <div className="shrink-0 text-ink-400">{action}</div> : null}
        </div>
        {/* ONE anatomy for every stat card: well → numeral → label → note →
            delta. Deltas pin to the card foot so pills align across the row
            no matter how long the notes run. */}
        <p className={cn("numeral mt-s2.5 text-[clamp(1.5rem,1.25rem+1.2vw,2rem)] font-semibold tracking-[-0.01em]", toneText ?? (ink ? "text-brand-deep-contrast" : "text-ink-950"))}>
          {value}
        </p>
        <p className={cn("mt-1 text-[13.5px] font-semibold", ink ? "text-brand-deep-contrast" : "text-ink-950")}>{label}</p>
        {note ? <p className={cn("mt-0.5 text-[12px] leading-snug", ink ? "text-white/50" : "text-muted")}>{note}</p> : null}
        {delta ? (
          <div className="mt-auto pt-s3">
            <Delta tone={delta.tone}>{delta.text}</Delta>
          </div>
        ) : null}
        {children ? <div className={cn(delta ? "pt-s3" : "mt-auto pt-s3")}>{children}</div> : null}
      </section>
    );
  }

  return (
    <section
      data-kpi=""
      className={cn(
        "flex min-w-0 flex-col rounded border p-s5 shadow-1",
        ink ? "border-brand-deep bg-brand-deep text-brand-deep-contrast" : "border-border bg-surface",
        className,
      )}
    >
      <p className={cn("text-[13px] font-medium text-muted", ink && "text-white/60")}>{label}</p>
      <p className={cn("numeral mt-s3 text-num font-semibold", toneText, ink && "text-brand-deep-contrast")}>
        {value}
      </p>
      {note ? <p className={cn("mt-2.5 text-[12.5px] leading-snug text-muted", ink && "text-white/60")}>{note}</p> : null}
      {meter ? (
        <div className={cn("mt-auto pt-s4", meter.value >= 0 && "w-full")}>
          <Meter value={meter.value} ok={meter.ok} onInk={ink} />
        </div>
      ) : null}
      {delta ? (
        <div className="mt-s4">
          <Delta tone={delta.tone}>{delta.text}</Delta>
        </div>
      ) : null}
      {children ? <div className="mt-s4">{children}</div> : null}
    </section>
  );
}

/** Meter — the reference's progress bar: lime fill on paper-100 track. */
export function Meter({ value, ok, onInk, className }: { value: number; ok?: boolean; onInk?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-pill", onInk ? "bg-white/15" : "bg-paper-100", className)}
    >
      <div
        className={cn("h-full rounded-pill", ok ? "bg-ok" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
      {pct === 0 ? null : null}
    </div>
  );
}

const deltaTones: Record<"ok" | "warn" | "danger" | "neutral", string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-paper-100 text-muted",
};

/** Delta — the reference's small change-pill under a KPI. */
export function Delta({ tone = "neutral", children }: { tone?: "ok" | "warn" | "danger" | "neutral"; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold", deltaTones[tone])}>{children}</span>;
}
