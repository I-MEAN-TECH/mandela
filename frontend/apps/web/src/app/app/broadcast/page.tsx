import { requireSession, requireBootstrap, getAnnouncements, createAnnouncementAction } from "@/lib/api";
import { Card, CardHead, EmptyState, StatusPill, SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { BroadcastForm } from "./BroadcastForm";

/** Broadcast — compose once, WhatsApp + SMS carry it. Rows from the DB. */
export default async function BroadcastPage() {
  const me = await requireSession();
  await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  const announcements = await getAnnouncements();

  return (
    <div>
      <SerifHeader
        crumb="Talk / Broadcast"
        title={<>Say it once, everyone hears.</>}
        sub="Announcements reach every guardian on WhatsApp instantly. Alerts are marked urgent."
      />

      <div className="mt-s7 grid gap-s3h lg:grid-cols-2">
        <Card>
          <CardHead title="New announcement" sub="Urgency means something: alert = act now" />
          <BroadcastForm action={createAnnouncementAction} />
        </Card>

        <Card>
          <CardHead title="Sent" sub="Newest first" />
          {announcements.announcements.length === 0 ? (
            <EmptyState title="Nothing sent yet" body="Announcements you post reach parents on WhatsApp instantly." />
          ) : (
            <div>
              {announcements.announcements.map((a) => (
                <div key={a.id} className="border-t border-paper-200 py-s3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-s2">
                    <p className="min-w-0 truncate text-[13.5px] font-semibold">{a.title}</p>
                    {a.urgency === "alert" ? (
                      <StatusPill tone="warn">Alert</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">Update</StatusPill>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{a.body}</p>
                  <p className="mt-1 font-mono text-[11.5px] text-muted">
                    {new Date(a.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
