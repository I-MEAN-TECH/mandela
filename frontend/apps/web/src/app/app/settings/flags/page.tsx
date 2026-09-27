import { requireSession, requireBootstrap, getFlags } from "@/lib/api";
import { SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { TwinLinks } from "@/components/TwinLinks";
import { FlagsClient } from "./FlagsClient";

/** Capability flags — the admin's desk switches. */
export default async function FlagsPage() {
  const me = await requireSession();
  if (!me) redirect("/login");
  if (me.principal.kind !== "staff") redirect("/app");
  await requireBootstrap();

  const data = await getFlags();
  const rows = "rows" in data ? data.rows : [];
  const isAdmin = me.principal.role === "admin";

  return (
    <div className="flex flex-col gap-s6">
      <AppLiveBar />
      <SerifHeader
        crumb="Settings / Flags & Integrations"
        title="Simple by default, whole when needed."
        sub="Every desk ships enabled-by-choice, not by accident — a day school never trips over boarding screens, and a boarding school turns the dorm on in one click."
      />
      <TwinLinks
        label="Platform"
        twins={[
          { href: "/app/settings/flags", label: "Capability flags" },
          { href: "/app/settings/integrations", label: "Integrations" },
        ]}
      />
      <FlagsClient rows={rows} isAdmin={isAdmin} />
    </div>
  );
}
