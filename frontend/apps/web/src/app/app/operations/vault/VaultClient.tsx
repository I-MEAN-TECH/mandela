"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import type { VaultDoc, DocTemplateRow } from "@/lib/api";
import { TemplateEditor } from "./TemplateEditor";
import { TemplatePreview } from "./TemplatePreview";
import { IssueDocumentModal, type LearnerOption } from "./IssueDocumentModal";

/**
 * Documents vault desk — the register of every issued document plus the
 * template shelf. Templates are theme forms (body markdown + accent, paper,
 * logo and signature-strip options) edited in place; issuing fills the
 * placeholders and files a frozen copy. Every document row's only exit is
 * "PDF" — /print/doc/[id], no other format is offered.
 */
export function VaultClient({
  docs,
  templates,
  learners,
  school,
  canEditTemplates,
}: {
  docs: VaultDoc[];
  templates: DocTemplateRow[];
  learners: LearnerOption[];
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null; logo_svg_path: string | null };
  canEditTemplates: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<DocTemplateRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<DocTemplateRow | null>(null);
  const [issuing, setIssuing] = useState<DocTemplateRow | null>(null);

  function openPdf(id: string) {
    window.open(`/print/doc/${id}`, "_blank");
  }

  return (
    <>
      <div className="grid gap-4">
        <Card>
          <CardHead title="Issued documents" sub="The vault register — every issue numbered and audited" />
          <div className="flex max-h-[420px] flex-col divide-y divide-paper-200 overflow-y-auto">
            {docs.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">Nothing issued yet — pick a template below.</p>
            ) : docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink-950">{d.title}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {d.entity_name ?? d.template_code ?? d.kind} · {d.issued_by} · {d.created_at.slice(0, 10)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => openPdf(d.id)}>
                  PDF
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Templates"
            sub={canEditTemplates ? "Theme forms — edit body, colors, logo & signatures" : "Issue from a theme form"}
            action={
              canEditTemplates ? (
                <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
                  New template
                </Button>
              ) : undefined
            }
          />
          <div className="flex flex-col divide-y divide-paper-200">
            {templates.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No templates yet.</p>
            ) : templates.map((t) => (
              <div key={t.code} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-[160px] flex-1">
                  <p className="text-[13.5px] font-semibold text-ink-950">{t.name}</p>
                  <p className="font-mono text-[11px] text-muted">
                    {t.code} · {t.doc_kind}
                    {t.style_json?.showSignatures === false ? " · no signatures" : t.style_json?.showSignatures ? " · signatures" : ""}
                    {t.style_json?.showLogo === false ? " · no logo" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewing(t)}>
                    Preview
                  </Button>
                  {canEditTemplates ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      Edit
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={pending} onClick={() => setIssuing(t)}>
                    Issue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {editing || creating ? (
        <TemplateEditor
          template={editing}
          school={school}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
      {previewing ? (
        <TemplatePreview
          template={previewing}
          school={school}
          onClose={() => setPreviewing(null)}
          onIssue={() => {
            const t = previewing;
            setPreviewing(null);
            setIssuing(t);
          }}
        />
      ) : null}
      {issuing ? (
        <IssueDocumentModal template={issuing} learners={learners} onClose={() => setIssuing(null)} />
      ) : null}
    </>
  );
}
