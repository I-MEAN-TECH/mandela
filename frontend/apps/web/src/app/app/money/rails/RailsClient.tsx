"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import {
  confirmRailsAction,
  dismissRailsAction,
  importBankCsvAction,
  type RailsSuggestionRow,
} from "@/lib/api";
import { CsvFilePicker } from "@/components/CsvFilePicker";

/**
 * Money Rails ⑭ — the ASSIST layer (docs/BUILD-PHASES.md Phase 2).
 * Daraja C2B and bank CSV both land as SUGGESTIONS; the bursar confirms in
 * one tap or keys by hand in Collect. The manual-entry share stays honestly
 * visible — rails never replace the hand (manual-first law).
 */

export function RailsQueue({ rows, learners }: {
  rows: RailsSuggestionRow[];
  learners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Suggestions queue"
        sub="Bank rows and M-Pesa callbacks wait here — nothing enters the ledger until you confirm."
      />
      {rows.length === 0 ? (
        <p className="py-5 text-[13.5px] text-ink-500">
          Queue clear. Import a bank statement below, or keep keying by hand — both always work.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-200">
          {rows.map((r) => {
            const exact = Number(r.match_score) >= 1;
            const pickedId = picked[r.id] ?? r.suggested_learner_id ?? "";
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-ink-950">{r.payer_name ?? "Unknown payer"}</p>
                    <span className="rounded-pill bg-paper-100 px-2 py-0.5 font-mono text-[10px] uppercase text-ink-500">
                      {r.source === "daraja-c2b" ? "M-Pesa" : "Bank CSV"}
                    </span>
                    {r.match_score != null ? (
                      <StatusPill tone={exact ? "ok" : "warn"}>{exact ? "exact match" : "guess"}</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">unmatched</StatusPill>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-500">
                    {r.paid_on} · {r.payer_ref ?? "no reference"}{r.match_reason ? ` · ${r.match_reason}` : ""}
                  </p>
                </div>
                <p className="numeral text-[14px] font-semibold text-ink-950">
                  Ksh {(Number(r.amount_cents) / 100).toLocaleString("en-KE")}
                </p>
                <select
                  value={pickedId}
                  onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))}
                  className="h-9 w-[190px] rounded-sm border border-paper-300 bg-surface px-2 text-[13px] text-ink-950"
                >
                  <option value="">Choose learner…</option>
                  {learners.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    disabled={pending || !pickedId}
                    onClick={() =>
                      start(async () => {
                        const res = await confirmRailsAction({
                          id: r.id,
                          learnerId: pickedId,
                          method: r.source === "daraja-c2b" ? "mpesa" : "bank",
                        });
                        setMsg(res.ok ? { ok: true, text: `Receipted` } : { ok: false, text: res.error ?? "Failed" });
                        if (res.ok) router.refresh();
                      })
                    }
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await dismissRailsAction({ id: r.id });
                        setMsg(res.ok ? { ok: true, text: "Dismissed" } : { ok: false, text: res.error ?? "Failed" });
                        if (res.ok) router.refresh();
                      })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {msg ? (
        <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
      ) : null}
    </Card>
  );
}

/** Shared row-shape for the bank statement: date, payer, reference, amount. */
function parseBankRows(text: string) {
  return text
    .split("\n")
    .map((line) => line.split(",").map((c) => c.trim()))
    .filter((c) => c.length >= 4)
    .map((c) => ({
      paidOn: c[0]!,
      payerName: c[1] || undefined,
      payerRef: c[2] || undefined,
      amountCents: Math.round(parseFloat(c[3]!.replace(/[^\d.]/g, "")) * 100),
    }))
    .filter((r) => r.amountCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.paidOn));
}

const BANK_TEMPLATE =
  "date,payer,reference,amount\n" +
  "2026-09-10,Jane Wanjiku,PAYSLIP-8812 2005001,4500\n" +
  "2026-09-10,M-PESA BANK,254733000001,3000\n";

export function CsvImportCard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = useState("");

  const importRows = (rows: { paidOn: string; payerName?: string; payerRef?: string; amountCents: number }[], fileName: string) => {
    if (!rows.length) {
      setMsg({ ok: false, text: "No valid rows — need: date, payer, reference, amount" });
      return;
    }
    start(async () => {
      const res = await importBankCsvAction({ fileName, rows });
      setMsg(
        res.ok && "data" in res
          ? { ok: true, text: `Imported ${rows.length} suggestion${rows.length === 1 ? "" : "s"} — confirm or dismiss each below.` }
          : { ok: false, text: res.error ?? "Failed" },
      );
      if (res.ok) {
        setText("");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHead
        title="Import bank statement (CSV)"
        sub="Upload the bank's export file, or paste rows as: date, payer, reference, amount. Each row becomes a suggestion — the engine guesses, you decide."
      />
      <div className="flex flex-col gap-3">
        <CsvFilePicker
          onFile={(fileText, filename) => {
            const rows = parseBankRows(fileText);
            if (!rows.length) {
              setMsg({ ok: false, text: `No valid rows in ${filename} — each line needs: date, payer, reference, amount` });
              return;
            }
            setMsg(null);
            importRows(rows, filename);
          }}
          loading={pending}
          templateText={BANK_TEMPLATE}
          templateName="bank-statement-template.csv"
          label="Upload the bank statement file"
          sub="Click to browse, or drop the bank's CSV export here"
        />

        <details className="rounded-sm border border-paper-200 bg-paper-50 px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-800">Or paste rows instead</summary>
          <form
            className="mt-2 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              importRows(parseBankRows(text), `paste-${new Date().toISOString().slice(0, 10)}`);
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={"2026-09-10, Jane Wanjiku, PAYSLIP-8812 2005001, 4500\n2026-09-10, M-PESA BANK, 254733000001, 3000"}
              className="w-full rounded-sm border border-paper-300 bg-surface p-3 font-mono text-[12.5px] text-ink-950"
            />
            <div>
              <Button type="submit" variant="secondary" size="sm" disabled={pending || !text.trim()}>Import pasted rows</Button>
            </div>
          </form>
        </details>

        {msg ? (
          <p className={msg.ok ? "text-[12.5px] text-pine-700" : "text-[12.5px] text-danger"} role="status">{msg.text}</p>
        ) : null}
      </div>
    </Card>
  );
}
