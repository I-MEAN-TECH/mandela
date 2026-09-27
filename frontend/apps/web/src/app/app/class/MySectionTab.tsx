"use client";

import { useState } from "react";
import { Card, CardHead, KpiCard, StatusPill, EmptyState, Money } from "@mandela/ui";
import type { MySectionFullData } from "@/lib/api";

/**
 * My Section (flank batch G, spec 43a) — the patron's surface inside the
 * teacher dashboard, visible ONLY when the school gave this teacher a
 * section to run. Register / Kit / Money (read-only, deliberately) /
 * Events, with a switcher for multi-hat patrons.
 */
export function MySectionTab({ data }: { data: MySectionFullData }) {
  const [idx, setIdx] = useState(0);
  const s = data.sections[idx];
  if (!s) return null;

  const kitLow = data.kit.filter((k) => k.qty <= k.min_qty).length;
  const active = data.register.filter((r) => r.active).length;

  return (
    <div className="flex flex-col gap-s3h">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Section:</p>
        {data.sections.map((sec, i) => (
          <button
            key={sec.id}
            onClick={() => setIdx(i)}
            className={`rounded-pill px-3 py-1 text-[12px] font-semibold ${i === idx ? "bg-pine-800 text-white" : "bg-paper-100 text-ink-700 hover:bg-paper-200"}`}
          >
            {sec.name}
          </button>
        ))}
      </div>

      <div className="grid gap-s3h sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard ink label="Members" value={s.members} note={`${active} active on the register`} />
        <KpiCard label="Kit lines" value={data.kit.length} note={kitLow > 0 ? `${kitLow} running low` : "all stocked"} tone={kitLow > 0 ? "warn" : "ok"} />
        <KpiCard label="Events (7 days)" value={data.events.length} note="past & upcoming" />
        <KpiCard label="Billed (members)" value={<Money cents={data.money.col_in} />} note="read-only — the bursar owns money" />
      </div>

      <div className="grid gap-s3h xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHead title="Register" sub={`${s.name} · members and their classes`} />
          {data.register.length === 0 ? (
            <EmptyState title="No members yet" body="The office assigns learners to your section." />
          ) : (
            <div className="flex flex-col divide-y divide-paper-200 px-s5 pb-s4">
              {data.register.map((r, i) => (
                <div key={r.admission_no + i} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-semibold text-ink-950">{r.learner}</p>
                    <p className="font-mono text-[11px] text-muted">{r.admission_no}{r.class_name ? ` · ${r.class_name}` : ""}</p>
                  </div>
                  <StatusPill tone={r.active ? "ok" : "neutral"}>{r.active ? "active" : "retired"}</StatusPill>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-s3h">
          <Card className="min-w-0">
            <CardHead title="Kit" sub="What your section holds and what needs replacing" />
            {data.kit.length === 0 ? (
              <EmptyState title="No kit on record" body="Ask the store to attach items to your section." />
            ) : (
              <div className="flex flex-col divide-y divide-paper-200 px-s5 pb-s4">
                {data.kit.map((k, i) => (
                  <div key={k.item + i} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink-900">{k.item}</span>
                    <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${k.qty <= k.min_qty ? "bg-danger-bg text-danger" : "bg-ok-bg text-ok"}`}>
                      {k.qty} on hand{!k.qty || k.qty <= k.min_qty ? " · LOW" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="min-w-0">
            <CardHead title="Section events" sub="Sessions, matches, meetings touching your section" />
            {data.events.length === 0 ? (
              <EmptyState title="Nothing this week" body="Section events appear as they are calendared." />
            ) : (
              <div className="flex flex-col divide-y divide-paper-200 px-s5 pb-s4">
                {data.events.map((e, i) => (
                  <div key={e.title + i} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-semibold text-ink-950">{e.title}</span>
                    <span className="text-[12px] text-muted">{new Date(e.starts_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
