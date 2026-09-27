"use client";

import { useState, useTransition } from "react";
import { Card, CardHead, StatusPill, EmptyState } from "@mandela/ui";
import { getAuditTrail, type AuditEntry } from "@/lib/api";
import { noun } from "@/lib/plural";
import { ArrowRight } from "lucide-react";

/**
 * Audit trail — the "prove your headcount" screen (spec §2.7).
 * Append-only feed: time, actor, action, entity, before→after diff.
 * Filters re-query the server action; RLS keeps every other role out
 * at the database, not the UI.
 */
const ACTION_CHIPS = [
  { value: "", label: "Everything" },
  { value: "staff", label: "Staff" },
  { value: "payment", label: "Payments" },
  { value: "settings", label: "Settings" },
  { value: "assessment", label: "Assessment" },
] as const;

const ACTOR_CHIPS = [
  { value: "", label: "All actors" },
  { value: "staff", label: "Staff" },
  { value: "guardian", label: "Guardians" },
  { value: "system", label: "System" },
] as const;

export function AuditTrailCard({ initialEntries }: { initialEntries: AuditEntry[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [pending, start] = useTransition();

  function refetch(nextAction: string, nextActor: string) {
    start(async () => {
      const res = await getAuditTrail({ action: nextAction || undefined, actor: nextActor || undefined, limit: 100 });
      if ("entries" in res) setEntries(res.entries);
    });
  }

  return (
    <Card>
      <CardHead
        title="Audit trail"
        sub="Append-only — every record, confirm and change, with who and what changed"
        action={
          <StatusPill tone={pending ? "neutral" : "ok"}>{pending ? "loading…" : `${entries.length} ${noun(entries.length, "entry")}`}</StatusPill>
        }
      />

      {/* Filters — chips, not dropdowns (form standard: ≤5 options → radios) */}
      <div className="flex flex-col gap-2 border-b border-paper-200 pb-s4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by action">
          {ACTION_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={action === c.value}
              onClick={() => {
                setAction(c.value);
                refetch(c.value, actor);
              }}
              className={`min-h-[36px] rounded-pill border-2 px-3.5 text-xs font-semibold transition-colors ${
                action === c.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-paper-300 bg-surface text-muted hover:bg-paper-100 hover:text-text"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by actor">
          {ACTOR_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={actor === c.value}
              onClick={() => {
                setActor(c.value);
                refetch(action, c.value);
              }}
              className={`min-h-[36px] rounded-pill border px-3.5 text-xs font-semibold transition-colors ${
                actor === c.value
                  ? "border-2 border-primary bg-primary-soft text-primary"
                  : "border-paper-300 bg-surface text-muted hover:bg-paper-100 hover:text-text"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No entries match" body="Nothing has been recorded for this filter yet." />
      ) : (
        <div>
          {entries.map((e, i) => (
            <article key={i} className="border-t border-paper-200 py-s4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[11.5px] font-semibold">{e.action}</span>
                <span className="text-[11.5px] text-muted">{e.entity}</span>
                <span className="ml-auto font-mono text-[10.5px] text-muted">{fmtWhen(e.at)}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">
                by <span className="font-semibold text-text">{e.actor_name ?? e.actor_kind}</span>
                {e.actor_name ? <span className="text-muted"> · {e.actor_kind}</span> : null}
              </p>
              <Diff before={e.before} after={e.after} />
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

/** before→after, only the keys that actually changed, mono, max 4 rows. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const changes = diffKeys(before, after);
  if (!changes.length) {
    return after && typeof after === "object" ? (
      <p className="mt-1.5 font-mono text-[11px] text-muted">record created</p>
    ) : null;
  }
  return (
    <div className="mt-2 overflow-hidden rounded-sm border border-paper-200 bg-paper-50">
      {changes.slice(0, 4).map((c) => (
        <div key={c.key} className="flex flex-wrap items-baseline gap-x-2 border-t border-paper-200 px-3 py-1.5 font-mono text-[11px] first:border-t-0">
          <span className="text-muted">{c.key}:</span>
          {c.from !== null && <span className="text-danger line-through decoration-danger/40">{c.from}</span>}
          <span aria-hidden><ArrowRight aria-hidden size={14} strokeWidth={2} /></span>
          <span className="font-semibold text-ok">{c.to ?? "—"}</span>
        </div>
      ))}
      {changes.length > 4 && (
        <div className="px-3 py-1.5 text-[10.5px] text-muted">+ {changes.length - 4} more fields changed</div>
      )}
    </div>
  );
}

function diffKeys(before: unknown, after: unknown): { key: string; from: string | null; to: string | null }[] {
  if (!after || typeof after !== "object") return [];
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const out: { key: string; from: string | null; to: string | null }[] = [];
  for (const key of Object.keys(a)) {
    if (key.startsWith("_") || key === "updated_at" || key === "created_at") continue;
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    out.push({ key, from: fmtVal(bv), to: fmtVal(av) });
  }
  return out;
}

function fmtVal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
