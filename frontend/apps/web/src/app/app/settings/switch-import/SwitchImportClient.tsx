"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { createSwitchingImportAction, commitSwitchingImportAction, type SwitchingImportRow } from "@/lib/api";
import { CsvFilePicker } from "@/components/CsvFilePicker";

const SWITCH_TEMPLATE =
  "first_name,last_name,class,gender,boarding,guardian_phone\n" +
  "Amina,Otieno,Grade 6,F,no,0712345678\n" +
  "Brian,Kimani,Grade 6,M,yes,0723456789\n";

export function SwitchImportClient({ imports }: { imports: SwitchingImportRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csv, setCsv] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  function mapCsv(text: string): Record<string, string>[] {
    // Accepts pasted CSV/TSV: first row = headers, rest = rows.
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0]!.includes("\t") ? "\t" : ",";
    const headers = lines[0]!.split(sep).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
      return row;
    });
  }

  function uploadFromText(text: string, provider: string, filename: string | null) {
    const rows = mapCsv(text);
    if (!rows.length) {
      setMsg({ ok: false, text: "That file needs a header row plus at least one learner row." });
      return;
    }
    start(async () => {
      const r = await createSwitchingImportAction({ provider, filename, rows });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Failed" }); return; }
      const res = r as unknown as { mappedCount?: number; errorCount?: number; id?: string; errors?: string[] };
      setPendingId(res.id ?? null);
      setMsg({
        ok: (res.mappedCount ?? 0) > 0,
        text: `Mapped ${res.mappedCount ?? 0}, ${res.errorCount ?? 0} with problems${res.errors?.length ? ` — e.g. ${res.errors[0]}` : ""}. Review below, then commit.`,
      });
      if ((res.mappedCount ?? 0) > 0) router.refresh();
    });
  }

  function upload() {
    uploadFromText(csv, "csv-paste", null);
  }

  function commit(id: string) {
    start(async () => {
      const r = await commitSwitchingImportAction({ id });
      setMsg(r.ok ? { ok: true, text: "Import committed — learners created." } : { ok: false, text: r.error ?? "Failed" });
      setPendingId(null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead title="1 · Submit their sheet" sub="Upload the file (browse or drag-drop) or paste rows. First line = headers. Recognised: name columns, class, gender, boarding, guardian phone."
          action={<Button size="sm" variant="secondary" onClick={() => uploadFromText(SWITCH_TEMPLATE, "csv-file", "sample-switch.csv")}>Try with sample data</Button>} />
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          <CsvFilePicker
            onFile={(text, filename) => uploadFromText(text, "csv-file", filename)}
            loading={pending}
            templateText={SWITCH_TEMPLATE}
            templateName="switch-import-template.csv"
            label="Upload their export file"
            sub="Click to browse, or drop the file here"
          />
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={7} spellCheck={false}
            placeholder={"first_name,last_name,class,gender,boarding,guardian_phone\nAmina,Otieno,Grade 6,F,no,0712345678\nBrian,Kimani,Grade 6,M,yes,0723456789"}
            className="w-full rounded-sm border border-paper-300 bg-surface p-3 font-mono text-[12px] outline-none focus:border-primary" />
          <Button size="sm" disabled={pending} onClick={upload}>Map rows</Button>
        </div>
        <ol className="flex flex-col gap-2 border-t border-paper-200 px-4 py-3.5 text-[13px] text-muted">
          <li><b className="text-ink-950">2.</b> Map normalises their columns into ours.</li>
          <li><b className="text-ink-950">3.</b> Commit creates learners + guardians — once, guarded.</li>
          <li><b className="text-ink-950">4.</b> Opening balances: bill on Invoices afterwards.</li>
        </ol>
        {msg ? <p className={`border-t border-paper-200 px-4 py-2.5 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p> : null}
      </Card>

      <Card>
        <CardHead title="Imports" sub="Mapped → committed · never twice" />
        <div className="flex max-h-[420px] flex-col divide-y divide-paper-200 overflow-y-auto">
          {imports.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No imports yet.</p>
          ) : imports.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-[180px] flex-1">
                <p className="text-[13px] font-semibold text-ink-950">{x.provider} · {x.rows_ok}/{x.rows_total} rows</p>
                <p className="text-[11.5px] text-muted">{x.created_at.slice(0, 16).replace("T", " ")} · {x.imported_count ?? 0} imported</p>
              </div>
              <StatusPill tone={x.status === "imported" ? "ok" : x.status === "failed" ? "warn" : "neutral"}>{x.status}</StatusPill>
              {x.status !== "imported" && x.status !== "failed" ? (
                <Button size="sm" disabled={pending} onClick={() => commit(x.id)}>Commit</Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
