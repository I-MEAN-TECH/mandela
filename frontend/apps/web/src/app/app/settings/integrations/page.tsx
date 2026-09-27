import { requireSession, requireBootstrap, getIntegrations } from "@/lib/api";
import { SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TwinLinks } from "@/components/TwinLinks";
import { IntegrationsBoard } from "./IntegrationsClient";

/**
 * Integrations 36 (docs/BUILD-PHASES.md Phase 2) — the school's rails:
 * WhatsApp worker (Talk), SMS fallback, M-Pesa Daraja (14), email.
 * Connection health only; secrets stay platform-side. All staff read;
 * admin toggles.
 */
export default async function IntegrationsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");

  const data = await getIntegrations();
  if ("error" in data) redirect("/app/settings");

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Settings`}
        title={<>Integrations, quietly healthy.</>}
        sub="The rails the school runs on — WhatsApp, SMS, M-Pesa, email. You see connection status here; credentials never live in the school database."
        actions={<AppLiveBar />}
      />
      <TwinLinks
        label="Platform"
        twins={[
          { href: "/app/settings/flags", label: "Capability flags" },
          { href: "/app/settings/integrations", label: "Integrations" },
        ]}
      />

      <div className="mt-s7 grid gap-s3h">
        <IntegrationsBoard rows={data.rows} isAdmin={me.principal.role === "admin"} />
      </div>
    </div>
  );
}
