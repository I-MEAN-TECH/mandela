import { requireSession, requireBootstrap, getSettings, getAuditTrail, getTerms, getRetentionPolicy, getChannelStatus, getIntegrity } from "@/lib/api";
import { Card, CardHead, EmptyState, SerifHeader, StatusPill } from "@mandela/ui";
import { SettingsForm } from "./SettingsForm";
import { ThemeEditor } from "./ThemeEditor";
import { AuditTrailCard } from "./AuditTrail";
import { TermsCalendar } from "./TermsCalendar";
import { RetentionPolicyCard } from "./Retention";
import { DailyLoop } from "./DailyLoop";
import { IntegrityCard } from "./IntegrityCard";
import { AppLiveBar } from "../LiveBar";
import type { SettingsData } from "@/lib/api";
import { redirect } from "next/navigation";

/** Settings — the school edits its own identity. Saved straight to school_settings. */
export default async function SettingsPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const settings = (await getSettings()) as SettingsData | { error: string };
  const canEdit = me.principal.role === "admin" || me.principal.role === "principal";
  // The audit feed is admin/principal — RLS (audit_read) enforces it in the DB;
  // here it's just a fetch skip for other roles.
  const audit = canEdit ? await getAuditTrail({ limit: 100 }) : null;
  const terms = canEdit ? await getTerms() : null;
  const retention = canEdit ? await getRetentionPolicy() : null;
  const channels = canEdit ? await getChannelStatus() : null;
  const integrity = canEdit ? await getIntegrity() : null;

  if ("error" in settings) {
    return (
      <div>
        <SerifHeader crumb={`${boot.school.name} / Admin`} title={<>School settings.</>} />
        <div className="mt-s7">
          <EmptyState title="Settings unavailable" body="The school database did not respond. Try again shortly." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Admin`}
        title={<>The school, as data.</>}
        sub="Everything the world sees about your school lives here — change it and every screen updates, because no page is hardcoded."
        actions={
          <div className="flex items-center gap-3">
            <StatusPill tone={canEdit ? "ok" : "neutral"}>{canEdit ? "you can edit" : "read-only"}</StatusPill>
            <AppLiveBar />
          </div>
        }
      />

      <div className="mt-s7 scroll-mt-6" id="profile">
        <SettingsForm
          settings={settings}
          canEdit={canEdit}
          heroLines={settings.tagline?.split("\n") ?? []}
        />
      </div>

      {canEdit ? (
        <div className="mt-s3h scroll-mt-6" id="theme">
          <Card>
            <CardHead
              title="School colors"
              sub="Your colors, on every screen — staff and parents see them the moment you save. Status colors stay fixed so meaning never changes."
            />
            <ThemeEditor initial={settings.theme ?? {}} />
          </Card>
        </div>
      ) : null}

      {canEdit && terms && !("error" in terms) ? (
        <div className="mt-s3h scroll-mt-6" id="terms">
          <TermsCalendar initial={terms} />
        </div>
      ) : null}

      {canEdit && audit && "entries" in audit ? (
        <div className="mt-s3h scroll-mt-6" id="audit">
          <AuditTrailCard initialEntries={audit.entries} />
        </div>
      ) : null}

      {canEdit && retention && !("error" in retention) ? (
        <div className="mt-s3h scroll-mt-6" id="retention">
          <RetentionPolicyCard initial={retention} canEdit={canEdit} />
        </div>
      ) : null}

      {canEdit ? (
        <div className="mt-s3h">
          <Card>
            <CardHead
              title="Your data leaves with you"
              sub="One click downloads the entire school database as JSON — every learner, payment, message and audit entry. Admin-only and audited; keep it somewhere safe."
            />
            <a
              href="/api/export"
              className="inline-flex h-11 items-center rounded-pill border border-border bg-surface px-5 text-[13px] font-semibold text-ink-950 hover:bg-paper-50"
            >
              Download all data (JSON)
            </a>
          </Card>
        </div>
      ) : null}

      {canEdit && channels && !("error" in channels) ? (
        <div className="mt-s3h scroll-mt-6" id="daily-loop">
          <Card>
            <CardHead
              title="Daily loop — WhatsApp & Email"
              sub="Connect the school once; parents get one message every morning: fees, homework, attendance."
            />
            <DailyLoop initial={channels} />
          </Card>
        </div>
      ) : null}

      {canEdit && integrity ? (
        <div className="mt-s3h scroll-mt-6" id="integrity">
          <IntegrityCard result={integrity} />
        </div>
      ) : null}
    </div>
  );
}
