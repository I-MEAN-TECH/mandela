"use client";

import { useMemo, useState } from "react";
import { Button } from "@mandela/ui";
import type { DocTemplateRow } from "@/lib/api";
import { ThemedDocSheet, type DocStyleOptions } from "@/components/doc/ThemedDocSheet";

/**
 * TemplatePreview — view what a template will print as, before issuing.
 * Renders the same ThemedDocSheet the PDF uses: school letterhead, theme
 * options, signature strip. A toggle switches between sample data (reads
 * like a finished document) and raw blanks ({{placeholders}} print as the
 * dotted lines the office still types). From here one tap issues the
 * document — PDF-only download, as everywhere in the vault.
 */

const SAMPLES: Record<string, string> = {
  learner_name: "Amina Wanjiru",
  adm_no: "ADM-0042",
  class_name: "Grade 6 · Elgon",
  guardian_name: "Mrs. Grace Wanjiru",
  term: "Term 2 · 2026",
  invoice_no: "INV-0042",
  receipt_no: "RCT-0187",
  po_no: "PO-0019",
  ref: "OFF/2026/019",
  subject: "Mid-term opening arrangements",
  to: "All teaching staff",
  from: "The Principal's office",
  body: "All learners report to the assembly hall by 7:30 am on opening day. Bringing this letter signed speeds up registration.",
  paybill: "400200",
  account: "ADM-0042",
  items_md: "| Tuition | 18,400 |\n| Lunch program | 3,200 |\n| Transport | 5,500 |",
  total: "27,100",
  paid: "15,000",
  balance: "12,100",
  amount: "15,000",
  reason: "Term 2 tuition instalment",
  method: "M-PESA",
  reference: "QGH7X2LM9P",
  attendance: "92% (46/50 days)",
  remark: "A steady term — keep up the reading habit.",
  // Curriculum vocabulary samples — the real issue fills these from the
  // learner's class pack (CBE levels or 8-4-4 letter grades).
  learner_label: "Learner",
  level_label: "Grade",
  area_label: "Learning Area",
  curriculum_name: "CBC / CBE",
  grading: "E=Emerging · D=Developing · M=Meeting · X=Exceeding",
  conduct: "Good",
  fees_status: "Cleared",
  reporting_date: "4 May 2026",
  fees_due: "12,100",
  valid_to: "Dec 2026",
  admission_fee: "25,000",
  caution_fee: "20,000",
  supplier: "Kilimanjaro Book Suppliers",
  deliver_to: "Main store — attention Bursar",
};

export function TemplatePreview({
  template,
  school,
  onClose,
  onIssue,
}: {
  template: DocTemplateRow;
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null };
  onClose: () => void;
  onIssue: () => void;
}) {
  const [sample, setSample] = useState(true);

  // Sample mode fills every placeholder we know; anything unknown stays as
  // {{key}} which the sheet renders as a dotted blank — honest about what
  // the office will still type at issue time.
  const shown = useMemo(() => {
    if (!sample) return template.body_md;
    const today = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
    return template.body_md.replace(/\{\{([^}]+)\}\}/g, (m, k: string) => {
      const key = k.trim();
      if (key === "school_name") return school.name;
      if (key === "issue_date") return today;
      return SAMPLES[key] ?? m;
    });
  }, [template.body_md, sample, school.name]);

  const sigOn = (template.style_json as DocStyleOptions | null)?.showSignatures !== false;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Preview ${template.name}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-border bg-surface shadow-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <p className="font-display text-[16px] font-semibold text-ink-950">Preview — {template.name}</p>
            <p className="font-mono text-[11px] text-muted">{template.code} · {template.doc_kind}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12.5px] text-ink-900">
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} className="accent-pine-700" />
              Sample data
            </label>
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-paper-100 p-4 sm:p-6">
          <div className="shadow-2">
            <ThemedDocSheet
              title={template.name}
              bodyMd={shown}
              style={(template.style_json as DocStyleOptions) ?? null}
              school={school}
              meta={{ issuer: null, issuedOn: sample ? new Date().toISOString() : null, ref: template.code, kind: template.doc_kind }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <p className="text-[11.5px] text-muted">
            Exactly what the PDF prints — {school.name} colors, logo{sigOn ? "" : " and signature strip off"} included.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={onIssue}>Issue document</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
