import { requireSession, requireBootstrap, getGuardianProfile } from "@/lib/api";
import { Card, CardHead, EmptyState, SerifHeader, StatusPill } from "@mandela/ui";
import { LinkChildCard } from "./LinkChildCard";
import { ChannelPrefs } from "./ChannelPrefs";

/** Profile — the guardian's own record: contacts, consent, children. */
export default async function ProfilePage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "guardian") {
    return (
      <div>
        <SerifHeader crumb={`${boot.school.name} / Profile`} title={<>Your record.</>} />
        <div className="mt-s7">
          <EmptyState title="Staff profiles live in the directory" body="Guardians see this page; staff details are in the Directory." />
        </div>
      </div>
    );
  }
  const profile = await getGuardianProfile();

  if ("error" in profile) {
    return (
      <div>
        <SerifHeader crumb={`${boot.school.name} / Profile`} title={<>Your record.</>} />
        <div className="mt-s7">
          <EmptyState title="Could not load your profile" body="The school database did not respond. Try again shortly." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Profile`}
        title={<>Your record.</>}
        sub="The details the school holds about you — the office keeps them current."
      />

      <div className="mt-s7 grid gap-s3h lg:grid-cols-2">
        <Card>
          <CardHead title={profile.full_name} sub={`${profile.relationship} · guardian`} />
          <div className="grid gap-s3">
            <Row label="Phone">{profile.phone}</Row>
            <Row label="Email">{profile.email ?? "—"}</Row>
            <div className="flex flex-wrap gap-2 pt-1">
              <StatusPill tone={profile.wa_opt_in ? "ok" : "neutral"}>
                WhatsApp {profile.wa_opt_in ? "on" : "off"}
              </StatusPill>
              <StatusPill tone={profile.sms_fallback ? "ok" : "neutral"}>
                SMS fallback {profile.sms_fallback ? "on" : "off"}
              </StatusPill>
            </div>
            <div className="mt-s3 border-t border-border pt-s3">
              <p className="microlabel mb-2">The school's morning message</p>
              <ChannelPrefs
                initialChannel={(profile.pref_channel as "whatsapp" | "email" | "none") ?? "whatsapp"}
                initialEmail={profile.email}
                hasPhone={Boolean(profile.phone)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Your children" sub={`${profile.learners.length} at ${boot.school.name}`} />
          {profile.learners.length === 0 ? (
            <>
              <EmptyState title="No children linked" body="Enter the one-time code from your admission slip — the office keeps a copy too." />
              <LinkChildCard onLinked={() => { /* the card refreshes via router below */ }} />
            </>
          ) : (
            <div>
              {profile.learners.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <p className="truncate text-[13.5px] font-semibold">{l.name}</p>
                  <span className="shrink-0 text-xs text-muted">{l.class ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-s3 border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13.5px] font-semibold">{children}</span>
    </div>
  );
}
