import { getDocRender, getBootstrapSafe } from "@/lib/api";
import { ThemedDocSheet, type DocStyleOptions } from "@/components/doc/ThemedDocSheet";

/**
 * Vault document PDF view — /print/doc/[id]. One A4 sheet with the school's
 * own letterhead (colors from theme_json, traced logo, contacts from
 * school_settings) and the frozen per-template theme options. The browser's
 * print dialog is the PDF export; there is deliberately no print button on
 * the sheet itself — the vault UI is the only door in, and its footer button
 * says "Download PDF" and nothing else.
 */
export default async function DocPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, boot] = await Promise.all([getDocRender(id), getBootstrapSafe()]);

  if ("error" in doc) {
    return (
      <main className="mx-auto max-w-[720px] px-8 py-24">
        <p className="font-display text-xl font-bold text-ink-950">Document unavailable</p>
        <p className="mt-2 text-sm text-ink-500">{doc.error} — sign in to the school office app to view issued documents.</p>
      </main>
    );
  }

  const style = (doc.style_json ?? {}) as DocStyleOptions;
  const school = {
    name: doc.school?.name ?? boot?.school.name ?? "",
    contact_phone: doc.school?.contact_phone ?? boot?.school.contact_phone ?? null,
    contact_email: doc.school?.contact_email ?? boot?.school.contact_email ?? null,
    contact_address: doc.school?.contact_address ?? boot?.school.contact_address ?? null,
    logo_svg_path: doc.school?.logo_svg_path ?? boot?.school.logo_svg_path ?? null,
  };
  return (
    <main className="mx-auto px-4 py-6 print:px-0 print:py-0">
      <ThemedDocSheet
        title={doc.title}
        bodyMd={doc.body_md}
        style={style}
        school={school}
        meta={{ issuer: doc.issued_by, issuedOn: doc.created_at, ref: doc.template_code, kind: doc.doc_kind }}
      />
    </main>
  );
}
