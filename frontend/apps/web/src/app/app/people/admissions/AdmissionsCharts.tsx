"use client";

import { CashflowChart, StatisticDonut, DonutLegend } from "@mandela/ui";
import type { AdmissionsAnalyticsData } from "@/lib/api";

/**
 * Admissions analytics 3 - the funnel as a picture (flank batch B).
 * Three live charts, zero hardcoding: conversion bars, source-mix donut,
 * and the 6-month enrolment trend (inquiries up, enrolled down).
 */

const STAGE_LABELS: Record<string, string> = {
  inquiry: "Inquiry",
  visit: "Visit",
  assessment: "Assessment",
  offered: "Offered",
  enrolled: "Enrolled",
  lost: "Lost",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm ?? "1") - 1] ?? m} ${(y ?? m).slice(2)}`;
}

export function AdmissionsCharts({ data }: { data: AdmissionsAnalyticsData }) {
  const stageOrder = ["inquiry", "visit", "assessment", "offered", "enrolled"];
  const byStage = new Map(data.funnel.map((f) => [f.stage, f.n]));
  const maxStage = Math.max(...stageOrder.map((s) => byStage.get(s) ?? 0), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-card border border-paper-200 bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Funnel · conversion</p>
        <div className="mt-3 flex flex-col gap-2">
          {stageOrder.map((s, i) => {
            const n = byStage.get(s) ?? 0;
            const prev = i > 0 ? byStage.get(stageOrder[i - 1]!) ?? 0 : n;
            const pct = prev > 0 ? Math.round((100 * n) / prev) : 0;
            return (
              <div key={s} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11.5px] text-ink-700">{STAGE_LABELS[s] ?? s}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-pill bg-paper-100">
                  <div
                    className="h-full rounded-pill bg-pine-700 transition-[width] duration-500"
                    style={{ width: `${Math.max(4, Math.round((100 * n) / maxStage))}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink-500">
                  {n} · {i === 0 ? "100%" : `${pct}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-500">Each bar shows how many survive to the next stage.</p>
      </div>

      <div className="rounded-card border border-paper-200 bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Where families come from</p>
        {data.sources.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-ink-500">No inquiries yet — the donut fills as the desk logs families.</p>
        ) : (
          <>
            <div className="mt-2 grid place-items-center">
              <StatisticDonut
                slices={data.sources.map((s) => ({ label: s.source, value: s.n }))}
                centerLabel="all families"
                centerValue={data.sources.reduce((a, b) => a + b.n, 0)}
                size={150}
                thickness={22}
              />
            </div>
            <DonutLegend
              slices={data.sources.map((s) => ({ label: s.source, value: s.n }))}
              total={data.sources.reduce((a, b) => a + b.n, 0)}
            />
          </>
        )}
      </div>

      <div className="rounded-card border border-paper-200 bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Enrolment trend · 6 months</p>
        <div className="mt-1">
          <CashflowChart
            months={data.trend.map((t) => ({
              label: monthLabel(t.month),
              up: t.inquiries,
              down: t.enrolled,
            }))}
            upLabel="Inquiries"
            downLabel="Enrolled"
          />
        </div>
      </div>
    </div>
  );
}
