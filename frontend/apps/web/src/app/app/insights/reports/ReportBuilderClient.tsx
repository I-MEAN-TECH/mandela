"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

import { useEffect, useState } from "react";
import { Button, Card, CardHead, EmptyState } from "@mandela/ui";
import { getReportDataset, type ReportDatasetPayload } from "@/lib/api";

const DATASETS = [
  { key: "money", label: "Money by class", sub: "Billed vs collected, this term" },
  { key: "attendance", label: "Attendance by day", sub: "Present / absent / late, last 30 days" },
  { key: "conduct", label: "Conduct by kind", sub: "Incidents and points, by category" },
] as const;

/**
 * ReportBuilderClient — v1: pick a dataset, filter by free text, sort by
 * any column (click the header), export the visible slice as CSV. Honest
 * data floor: every number comes from the same queries the screens show.
 */
export function ReportBuilderClient() {
  const [dataset, setDataset] = useState<(typeof DATASETS)[number]["key"]>("money");
  const [data, setData] = useState<ReportDatasetPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getReportDataset(dataset).then((res) => {
      if (!alive) return;
      setLoading(false);
      if ("error" in res) setErr(res.error);
      else setData(res);
    });
    return () => {
      alive = false;
    };
  }, [dataset]);

  function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  }

  function download() {
    const blob = new Blob([toCsv(sorted, columns)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mandela-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = data?.columns ?? [];
  const numeric = new Set(
    (data?.rows ?? []).slice(0, 5).flatMap((r) => columns.filter((c) => typeof r[c] === "number" || /^\d+$/.test(String(r[c] ?? "")))),
  );
  const filtered = (data?.rows ?? []).filter((r) =>
    q.trim() ? columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q.trim().toLowerCase())) : true,
  );
  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const an = Number(av), bn = Number(bv);
        const cmp = Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== "" && String(bv).trim() !== "" ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""));
        return cmp * sortDir;
      })
    : filtered;

  return (
    <div className="grid gap-s3h">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick a dataset">
        {DATASETS.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={dataset === d.key}
            onClick={() => {
              setDataset(d.key);
              setQ("");
              setSortKey(null);
            }}
            className={`min-h-[44px] rounded-pill border px-4 text-[13px] font-semibold transition-colors ${
              dataset === d.key
                ? "border-2 border-primary bg-primary-soft text-primary"
                : "border-paper-300 bg-surface text-muted hover:bg-paper-100 hover:text-ink-900"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHead
          title={DATASETS.find((d) => d.key === dataset)?.label ?? dataset}
          sub={DATASETS.find((d) => d.key === dataset)?.sub ?? ""}
          action={
            <Button size="sm" variant="secondary" onClick={download} disabled={sorted.length === 0}>
              Export CSV
            </Button>
          }
        />
        {err ? (
          <EmptyState title="Dataset unavailable" body={err} />
        ) : loading ? (
          <p className="px-s5 pb-s5 text-[13px] text-muted">Loading the numbers…</p>
        ) : sorted.length === 0 ? (
          <EmptyState title="Nothing matches" body="Clear the filter — or the dataset is genuinely empty." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-paper-200">
                  {columns.map((c) => (
                    <th key={c} className={`px-4 py-2.5 ${numeric.has(c) ? "text-right" : "text-left"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          if (sortKey === c) setSortDir((d) => (d === 1 ? -1 : 1));
                          else {
                            setSortKey(c);
                            setSortDir(1);
                          }
                        }}
                        className={`font-semibold uppercase tracking-wide text-[11px] ${sortKey === c ? "text-ink-950" : "text-muted hover:text-ink-800"}`}
                        aria-label={`Sort by ${c}`}
                      >
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                        {sortKey === c ? (sortDir === 1 ? <ChevronUp aria-hidden size={13} className="inline align-[-2px]" /> : <ChevronDown aria-hidden size={13} className="inline align-[-2px]" />) : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} className="border-b border-paper-200 last:border-b-0">
                    {columns.map((c) => (
                      <td key={c} className={`px-4 py-2.5 ${numeric.has(c) ? "text-right tabular-nums" : ""}`}>
                        {numeric.has(c) ? Number(r[c]).toLocaleString() : String(r[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[13px] font-semibold text-ink-900">
          Filter
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type to filter rows…"
            className="ml-2 w-56 rounded-sm border border-border bg-surface px-3 py-2 text-sm focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100"
          />
        </label>
        <p className="text-[12px] text-muted">
          {sorted.length} of {(data?.rows ?? []).length} rows · click a header to sort
        </p>
      </div>
    </div>
  );
}
