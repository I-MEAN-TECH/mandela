"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { issueDocumentAction, type DocTemplateRow } from "@/lib/api";

/**
 * IssueDocument — fill one template's {{placeholders}} and file the issued
 * copy in the vault. A learner picker drives the identity fields
 * (learner_name / adm_no / class_name / guardian_name), signature names for
 * the strip are captured here, and everything else is free-form. On success
 * the vault opens the PDF view (/print/doc/[id]) — download-as-PDF is the
 * only exit; the doc itself never shows a print button.
 */

const AUTO_KEYS = ["learner_name", "adm_no", "class_name", "guardian_name", "items_md", "total", "paid", "balance"];
/** Report-card kind: the curriculum auto-fill owns these too (vocab, scale, attendance…). */
const REPORTCARD_AUTO = new Set(["learner_label", "level_label", "area_label", "curriculum_name", "grading", "term", "attendance"]);
const REPORTCARD_REQUIRED_PLACEHOLDER = "learner_name";

export interface LearnerOption { id: string; name: string; adm: string | null; class_name: string | null }

function inputCls() {
  return "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] focus:border-pine-300 focus:outline-none focus:ring-2 focus:ring-pine-100";
}

export function IssueDocumentModal({
  template,
  learners,
  onClose,
}: {
  template: DocTemplateRow;
  learners: LearnerOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [learnerId, setLearnerId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [signer1, setSigner1] = useState("");
  const [signer2, setSigner2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isReportCard = template.doc_kind === "report-card";
  const placeholders = [...new Set([...template.body_md.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!.trim()))];
  const autoKeys = isReportCard ? [...AUTO_KEYS, ...REPORTCARD_AUTO] : AUTO_KEYS;
  const manualKeys = placeholders.filter((k) => !autoKeys.includes(k));
  const learner = learners.find((l) => l.id === learnerId) ?? null;
  const needsLearner = isReportCard || placeholders.includes(REPORTCARD_REQUIRED_PLACEHOLDER);

  async function submit() {
    setErr(null);
    if (needsLearner && !learnerId) {
      return setErr("Pick a learner — the report card follows their class curriculum.");
    }
    setPending(true);
    const base: Record<string, string> = {
      learner_name: learner?.name ?? "",
      adm_no: learner?.adm ?? "",
      class_name: learner?.class_name ?? "",
    };
    const res = await issueDocumentAction({
      templateCode: template.code,
      entityType: learnerId ? "learner" : "school",
      entityId: learnerId || null,
      title: template.name,
      placeholders: { ...base, ...fields, signer1_name: signer1, signer2_name: signer2 },
    });
    setPending(false);
    if (res && "ok" in res && res.ok === false) return setErr(res.error ?? "Could not issue the document.");
    const id = res && "id" in res ? (res as { id?: string }).id : null;
    onClose();
    router.refresh();
    if (id) window.open(`/print/doc/${id}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Issue ${template.name}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-border bg-surface p-5 shadow-2">
        <p className="font-display text-[16px] font-semibold text-ink-950">Issue — {template.name}</p>
        <p className="mt-0.5 text-[12px] text-muted">Unfilled placeholders print as dotted blanks on the PDF.</p>

        {needsLearner ? (
          <label className="mt-3 block text-[12.5px] font-semibold text-ink-900">
            Learner{isReportCard ? " — the card follows their class curriculum" : ""}
            <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} className={`mt-1 ${inputCls()}`}>
              <option value="">{isReportCard ? "— choose a learner —" : "— none (school-wide document) —"}</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.class_name ?? "—"} {l.adm ? `· ${l.adm}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {manualKeys.map((k) => (
          <label key={k} className="mt-3 block text-[12.5px] font-semibold text-ink-900">
            <span className="font-mono text-[11px] text-muted">{k}</span>
            {k === "body" ? (
              <textarea value={fields[k] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} rows={4} className={`mt-1 ${inputCls()}`} />
            ) : (
              <input value={fields[k] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))} className={`mt-1 ${inputCls()}`} />
            )}
          </label>
        ))}

        {template.style_json?.showSignatures !== false ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] font-semibold text-ink-900">
              {String(template.style_json?.signer1Label ?? "Signer 1")} name
              <input value={signer1} onChange={(e) => setSigner1(e.target.value)} className={`mt-1 ${inputCls()}`} />
            </label>
            <label className="block text-[12.5px] font-semibold text-ink-900">
              {String(template.style_json?.signer2Label ?? "Signer 2")} name
              <input value={signer2} onChange={(e) => setSigner2(e.target.value)} className={`mt-1 ${inputCls()}`} />
            </label>
          </div>
        ) : null}

        {err ? <p className="mt-3 text-[13px] font-semibold text-danger" role="alert">{err}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending}>Issue & open PDF</Button>
        </div>
      </div>
    </div>
  );
}
