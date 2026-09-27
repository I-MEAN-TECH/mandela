"use client";

import { useState, useTransition } from "react";
import { Button, StatusPill, Wizard } from "@mandela/ui";
import {
  updateChannelsAction,
  testChannelAction,
  type ChannelStatus,
} from "@/lib/api";

/**
 * DailyLoop — Settings → "Daily loop" (docs/ECOSYSTEM-STRATEGY.md Loop 2).
 * The admin connects the school's WhatsApp + Email in four taps with zero
 * IT background (docs/SIMPLICITY.md), then switches the morning digest on.
 * Secrets are write-only: the server stores them encrypted, the UI shows
 * only connected/not.
 */

const waProviderHint =
  "In your Meta business portfolio: WhatsApp → API Setup → copy the Phone number ID and create a permanent token. Paste both here.";

export function DailyLoop({ initial }: { initial: ChannelStatus }) {
  const [pending, start] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  const [waPhoneId, setWaPhoneId] = useState(initial.whatsapp.phoneNumberId ?? "");
  const [waToken, setWaToken] = useState("");
  const [smtpHost, setSmtpHost] = useState(initial.email.host ?? "");
  const [smtpPort, setSmtpPort] = useState(initial.email.port ? String(initial.email.port) : "587");
  const [smtpUser, setSmtpUser] = useState(initial.email.host ? "" : "");
  const [smtpFrom, setSmtpFrom] = useState(initial.email.from ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [digestTime, setDigestTime] = useState(initial.digest.time);

  const waConnected = initial.whatsapp.connected;
  const emailConnected = initial.email.connected;
  const digestOn = initial.digest.enabled;

  const save = (input: Parameters<typeof updateChannelsAction>[0], okMsg: string) => {
    start(async () => {
      const res = await updateChannelsAction(input);
      setSaveMsg(res.ok ? okMsg : (res.error ?? "Could not save — try again"));
    });
  };

  const runTest = (channel: "whatsapp" | "email") => {
    if (!testTo.trim()) {
      setTestMsg("Type the phone number or email to send the test to.");
      return;
    }
    start(async () => {
      const res = await testChannelAction({ channel, to: testTo.trim() });
      setTestMsg(res.ok ? `Test sent to ${testTo.trim()} — ask them to confirm it arrived.` : (res.note ?? res.error ?? "Test failed — check the details above."));
    });
  };

  return (
    <div className="grid gap-s3h">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={waConnected ? "ok" : "neutral"}>WhatsApp {waConnected ? "connected" : "not connected"}</StatusPill>
        <StatusPill tone={emailConnected ? "ok" : "neutral"}>Email {emailConnected ? "connected" : "not connected"}</StatusPill>
        <StatusPill tone={digestOn ? "ok" : "neutral"}>Morning message {digestOn ? `on · ${initial.digest.time}` : "off"}</StatusPill>
      </div>

      <Wizard
        steps={[
          {
            title: "WhatsApp",
            hint: waProviderHint,
            content: (
              <div className="grid gap-s3h">
                <label className="block text-[13px] font-semibold">
                  Phone number ID
                  <input
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    autoComplete="off"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block text-[13px] font-semibold">
                  Access token {waConnected ? <span className="font-normal text-muted">(leave empty to keep the saved one)</span> : null}
                  <input
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            ),
            answers: [
              { label: "WhatsApp", value: waConnected ? "already connected — changes replace it" : "not connected yet" },
              { label: "Phone number ID", value: waPhoneId || "—" },
            ],
            validate: () =>
              waPhoneId.trim() && waToken.trim() ? null
              : waConnected ? null
              : "Paste both the Phone number ID and the token (or go Back and finish later)",
          },
          {
            title: "Email",
            hint: "From your mail provider: the SMTP server, port, username and an app password.",
            content: (
              <div className="grid gap-s3h">
                <div className="grid grid-cols-2 gap-s3">
                  <label className="block text-[13px] font-semibold">
                    SMTP server
                    <input
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.gmail.com"
                      autoComplete="off"
                      className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="block text-[13px] font-semibold">
                    Port
                    <input
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      inputMode="numeric"
                      className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
                <label className="block text-[13px] font-semibold">
                  Username
                  <input
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="school@stmarys.ac.ke"
                    autoComplete="off"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block text-[13px] font-semibold">
                  App password {emailConnected ? <span className="font-normal text-muted">(leave empty to keep the saved one)</span> : null}
                  <input
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block text-[13px] font-semibold">
                  From name <span className="font-normal text-muted">(what parents see)</span>
                  <input
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="St Mary's Junior School"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            ),
            answers: [
              { label: "Email", value: emailConnected ? "already connected — changes replace it" : "not connected yet" },
              { label: "Server", value: smtpHost ? `${smtpHost} : ${smtpPort}` : "—" },
              { label: "Username", value: smtpUser || "—" },
            ],
            validate: () => {
              if (emailConnected) return null; // saved creds stay until replaced
              if (!smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()) {
                return "Fill server, username and app password (or go Back and finish later)";
              }
              const port = Number(smtpPort);
              if (!Number.isInteger(port) || port < 1 || port > 65535) return "The port should be a number like 587 or 465";
              return null;
            },
          },
          {
            title: "Morning message",
            hint: "One message per parent, every school day: fees, homework, attendance.",
            content: (
              <div className="grid gap-s3h">
                <label className="block text-[13px] font-semibold">
                  Send at
                  <input
                    value={digestTime}
                    onChange={(e) => setDigestTime(e.target.value)}
                    placeholder="07:00"
                    inputMode="numeric"
                    className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="mt-1 block text-xs text-muted">Kenyan time. Parents with no email get WhatsApp; parents who prefer email get email.</span>
                </label>
              </div>
            ),
            answers: [{ label: "Morning message", value: `at ${digestTime || "07:00"} Kenyan time` }],
            validate: () => (/^([01]\d|2[0-3]):[0-5]\d$/.test(digestTime.trim()) ? null : "Use a 24-hour time like 07:00"),
          },
        ]}
        onConfirm={() =>
          new Promise((resolve) => {
            start(async () => {
              const res = await updateChannelsAction({
                waPhoneNumberId: waPhoneId.trim() || null,
                ...(waToken.trim() ? { waToken: waToken.trim() } : {}),
                smtpHost: smtpHost.trim() || null,
                smtpPort: Number(smtpPort) || null,
                smtpUser: smtpUser.trim() || null,
                smtpFrom: smtpFrom.trim() || null,
                ...(smtpPass.trim() ? { smtpPass: smtpPass.trim() } : {}),
                digestTime: digestTime.trim() || "07:00",
              });
              if (res.ok) {
                setSaveMsg("Saved — encrypted and audit-logged — done");
                resolve("Saved");
              } else {
                resolve(null);
                setSaveMsg(res.error ?? "Could not save");
              }
            });
          })
        }
        doneTitle="The school is connected"
        doneHint="Turn the morning message on with the gold button below, then send a test to yourself."
      />

      <div className="flex flex-wrap items-center gap-s3">
        <Button
          variant="primary"
          size="lg"
          disabled={pending || digestOn}
          onClick={() => save({ digestEnabled: true }, "Morning message is on — done")}
        >
          {digestOn ? "Morning message is on" : "Turn on the morning message"}
        </Button>
        {digestOn ? (
          <Button variant="ghost" size="lg" disabled={pending} onClick={() => save({ digestEnabled: false }, "Morning message is off — done")}>
            Turn off
          </Button>
        ) : null}
      </div>

      <div className="rounded-sm border border-border bg-surface p-s4">
        <p className="text-[13px] font-semibold">Send a test before the real day</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="07xx xxx xxx or you@school.ac.ke"
            className="h-11 w-64 rounded-sm border border-border bg-paper px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button variant="secondary" size="md" disabled={pending} onClick={() => runTest("whatsapp")}>
            Test WhatsApp
          </Button>
          <Button variant="secondary" size="md" disabled={pending} onClick={() => runTest("email")}>
            Test email
          </Button>
        </div>
      </div>

      {saveMsg || testMsg ? (
        <p role="status" className="text-sm font-semibold text-ok">
          {testMsg ?? saveMsg}
        </p>
      ) : null}
    </div>
  );
}
