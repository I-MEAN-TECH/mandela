import { requireSession, requireBootstrap, getVaultDocs, getDocTemplates, getLearners } from "@/lib/api";
import { KpiCard, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { VaultClient } from "./VaultClient";

/**
 * Documents vault (34) — every issued letter, certificate, invoice and ID in
 * one register: who issued it, from which template, when. Templates are theme
 * forms (brand colors + logo + signature strip) and the only download is PDF.
 */
export default async function VaultPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const role = me.principal.role ?? "";
  if (!["admin", "principal", "bursar", "counter", "secretary"].includes(role)) redirect("/app");

  const [d, t, l] = await Promise.all([getVaultDocs(), getDocTemplates(), getLearners()]);
  // The API wraps both lists ({ docs: … } / { templates: … }) — unwrap, and
  // degrade to [] only when the API itself failed (error object / fallback).
  const docs = Array.isArray(d) ? d : d && "docs" in d && Array.isArray(d.docs) ? d.docs : [];
  const templates = Array.isArray(t) ? t : t && "templates" in t && Array.isArray(t.templates) ? t.templates : [];
  const learnerRows = (l as { learners?: { id: string; name: string; admission_no: string; class: string | null }[] } | null)?.learners ?? [];

  const learners = learnerRows.map((r) => ({
    id: r.id,
    name: r.name,
    adm: r.admission_no,
    class_name: r.class,
  }));

  return (
    <>
      <SerifHeader
        crumb={`${boot.school.name} / Operations`}
        title="Documents vault"
        sub="Invoices, memos, notices, report cards — every issue themed, numbered and audited."
        actions={<AppLiveBar />}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard ink label="Issued (all time)" value={docs.length} />
        <KpiCard label="Templates" value={templates.length} note="editable theme forms" />
        <KpiCard label="Issued this month" value={docs.filter((x) => x.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length} tone="ok" />
        <KpiCard label="Learner documents" value={docs.filter((x) => x.entity_type === "learner").length} />
      </div>

      <div className="mt-6">
        <VaultClient
          docs={docs}
          templates={templates}
          learners={learners}
          school={{
            name: boot.school.name,
            contact_phone: boot.school.contact_phone,
            contact_email: boot.school.contact_email,
            contact_address: boot.school.contact_address,
            logo_svg_path: boot.school.logo_svg_path,
          }}
          canEditTemplates={["admin", "principal"].includes(role)}
        />
      </div>
    </>
  );
}
