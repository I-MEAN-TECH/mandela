"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { importLearnersCsvAction, type CsvImportResult } from "@/lib/api";
import { CsvFilePicker } from "@/components/CsvFilePicker";

/**
 * Bulk CSV import (docs/MASTER-CHECKLIST.md ②) — the demo-to-sale
 * converter. Submit a file (browse or drag-drop) or paste rows directly;
 * existing admission numbers update in place; guardian phone reuses the
 * sibling auto-link so a family is entered once. Headers are alias-matched
 * server-side, so any common export column set maps onto our fields.
 */
const TEMPLATE =
  "admission_no,first_name,middle_name,last_name,gender,dob,class,stream,guardian_name,guardian_phone,guardian_email,boarding\n" +
  "ADM-021,Amina,,Wanjiru,F,2013-04-12,G7B,,Gace Wanjiru,254711000111,gace@example.com,false\n" +
  ",Brian,Otis,Omondi,M,2012-09-30,G8A,,Grace Otieno,0722 555 666,,true\n";

export function ImportClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<CsvImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runText = (text: string, filename?: string | null) => {
    setErr(null);
    setRes(null);
    if (text.trim().split(/\r?\n/).length < 2) {
      setErr("That file needs a header row plus at least one learner row.");
      return;
    }
    start(async () => {
      const r = await importLearnersCsvAction(text, filename);
      if (r && ("error" in r || !r)) setErr(typeof r === "object" && r && "error" in r ? String(r.error) : "import failed");
      else if (r) {
        setRes(r as CsvImportResult);
        router.refresh();
      }
    });
  };

  const run = () => runText(csv);

  return (
    <Card>
      <CardHead
        title="Bulk import (CSV)"
        sub="Upload the school's export file, or paste rows below. Columns are alias-matched — admission_no/admno/adm no, first_name/firstname, class/class_name/stream/grade/form, guardian_phone/parent_phone… An existing admission_no updates that learner; a matching guardian phone links the sibling instead of creating a duplicate family."
        action={<Button onClick={() => runText(TEMPLATE, "sample-data.csv")}>Try with sample data</Button>}
      />
      <div className="flex flex-col gap-s3 px-s5 pb-s5">
        <CsvFilePicker
          onFile={(text, filename) => runText(text, filename)}
          loading={pending}
          templateText={TEMPLATE}
          templateName="learner-import-template.csv"
          label="Upload a CSV file"
          sub="Click to browse, or drop the school's export here"
        />

        <details className="rounded-sm border border-paper-200 bg-paper-50 px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-800">Or paste rows instead</summary>
          <textarea
            className="mt-2 min-h-[110px] w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12.5px]"
            placeholder={"admission_no,first_name,last_name,gender,dob,class,guardian_name,guardian_phone,boarding\nADM-021,Amina,Wanjiru,F,2013-04-12,G7B,Gace Wanjiru,254711000111,false"}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <div className="mt-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={run}>Import pasted rows</Button>
          </div>
        </details>

        {err ? <p className="text-sm text-danger">{err}</p> : null}
        {res ? (
          <div className="flex flex-wrap items-center gap-s2 text-sm">
            <StatusPill tone={res.ok ? "ok" : "warn"}>{res.ok ? "done" : "partial"}</StatusPill>
            <span>{res.created} created · {res.updated} updated · {res.skipped} skipped · {res.siblingsLinked} sibling links</span>
            {res.errors.slice(0, 5).map((e) => (
              <p key={e.line} className="w-full text-xs text-danger">line {e.line}: {e.message}</p>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
