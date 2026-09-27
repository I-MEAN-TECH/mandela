import { requireSession, requireBootstrap, getMessages, getGuardianMessages } from "@/lib/api";
import { Card, CardHead, DataTable, EmptyState, SerifHeader, StatusPill } from "@mandela/ui";
import { redirect } from "next/navigation";
import { noun } from "@/lib/plural";
import { AppLiveBar } from "../LiveBar";

/**
 * Messages — staff see the delivery ledger (announcement × guardian);
 * guardians see their own message history. Both live.
 */
export default async function MessagesPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();

  if (me.principal.kind === "guardian") {
    const { messages } = await getGuardianMessages();
    return (
      <div>
        <SerifHeader
          crumb={`${boot.school.name} / Messages`}
          title={<>What the school told you.</>}
          sub="Every announcement sent to your phone, with its delivery state."
          actions={<AppLiveBar />}
        />
        <div className="mt-s7 grid gap-s3h">
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" body="School announcements appear here the moment they're sent to you." />
          ) : (
            messages.map((m) => (
              <Card key={m.id}>
                <CardHead
                  title={m.title ?? "School message"}
                  sub={new Date(m.created_at).toLocaleString("en-KE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                  action={
                    <StatusPill tone={m.state === "failed" ? "danger" : m.state === "queued" ? "warn" : m.urgency === "alert" ? "warn" : "ok"}>
                      {m.state === "failed" ? "failed" : m.urgency === "alert" ? "alert" : m.state}
                    </StatusPill>
                  }
                />
                {m.body ? <p className="text-sm leading-relaxed text-muted">{m.body}</p> : null}
                <p className="mt-s3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400">
                  via {m.channel}
                </p>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  if (me.principal.kind !== "staff") redirect("/app");
  const { messages } = await getMessages();
  const sent = messages.filter((m) => m.state !== "queued").length;

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Talk`}
        title={<>Did it land?</>}
        sub={`${sent} of ${messages.length} ${noun(messages.length, "message", "messages")} delivered — WhatsApp and SMS receipts, newest first.`}
        actions={<AppLiveBar />}
      />

      <div className="mt-s7">
        <Card>
          <CardHead title="Delivery ledger" sub="Announcements reaching guardians, state by state" />
          {messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              body="Send a broadcast and every guardian's message appears here with its delivery state."
            />
          ) : (
            <DataTable
              columns={[
                { key: "title", title: "Announcement" },
                { key: "guardian", title: "Guardian" },
                { key: "learner", title: "About" },
                { key: "channel", title: "Channel" },
                { key: "state", title: "State" },
                { key: "when", title: "Sent" },
              ]}
              rows={messages.map((m) => ({
                title: m.title ?? "—",
                guardian: m.guardian,
                learner: m.learner ?? "—",
                channel: <span className="capitalize">{m.channel}</span>,
                state: (
                  <StatusPill tone={m.state === "failed" ? "danger" : m.state === "queued" ? "warn" : m.state === "read" ? "neutral" : "ok"}>
                    {m.state}
                  </StatusPill>
                ),
                when: new Date(m.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
              }))}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
