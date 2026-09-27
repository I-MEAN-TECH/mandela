"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusPill } from "@mandela/ui";
import { updateGuardianChannelAction } from "@/lib/api";

/**
 * ChannelPrefs — the guardian picks where the school's daily message lands:
 * WhatsApp, Email, or silence. Plain buttons, not a settings maze
 * (docs/SIMPLICITY.md Rule 2). Every change is audit-logged server-side.
 */
export function ChannelPrefs({
  initialChannel,
  initialEmail,
  hasPhone,
}: {
  initialChannel: "whatsapp" | "email" | "none";
  initialEmail: string | null;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(initialChannel);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [savedEmail, setSavedEmail] = useState(initialEmail ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const emailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave =
    !pending &&
    emailValid &&
    (channel !== "email" || email.trim() !== "") &&
    (channel !== "whatsapp" || hasPhone) &&
    (channel !== initialChannel || email.trim() !== savedEmail);

  const save = () => {
    start(async () => {
      const res = await updateGuardianChannelAction({
        prefChannel: channel,
        email: email.trim() ? email.trim() : null,
      });
      if (res.ok) {
        setMsg("Saved — done");
        setSavedEmail(email.trim());
        router.refresh();
      } else {
        setMsg(res.error ?? "Could not save — try again");
      }
    });
  };

  const options: { key: "whatsapp" | "email" | "none"; label: string; note: string; disabled?: boolean }[] = [
    { key: "whatsapp", label: "WhatsApp", note: hasPhone ? "Messages come to this phone" : "No phone number on file — ask the office", disabled: !hasPhone },
    { key: "email", label: "Email", note: "One email every morning", disabled: false },
    { key: "none", label: "No messages", note: "You can switch back any time" },
  ];

  return (
    <div className="grid gap-s3">
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={o.disabled}
            aria-pressed={channel === o.key}
            onClick={() => setChannel(o.key)}
            className={`flex h-14 items-center justify-between rounded-sm border px-4 text-left text-sm font-semibold disabled:opacity-50 ${
              channel === o.key ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-paper-100"
            }`}
          >
            <span>
              {o.label} <span className="block text-xs font-normal text-muted">{o.note}</span>
            </span>
            {channel === o.key ? <span aria-hidden className="text-primary">●</span> : null}
          </button>
        ))}
      </div>

      {channel === "email" ? (
        <label className="block text-[13px] font-semibold">
          Email address
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            className={`mt-1.5 h-12 w-full rounded-sm border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${emailValid ? "border-border" : "border-danger ring-1 ring-danger"}`}
          />
          {!emailValid ? <p className="mt-1 text-xs font-semibold text-danger">!that email does not look right — check it</p> : null}
        </label>
      ) : null}

      <div className="flex items-center gap-s3">
        <Button variant="primary" size="lg" disabled={!canSave} onClick={save}>
          {pending ? "Saving…" : "Save my choice"}
        </Button>
        {msg && msg.endsWith(" — done") ? (
          <span className="text-sm font-semibold text-ok" role="status">
            {msg}
          </span>
        ) : null}
        {msg && !msg.endsWith(" — done") ? (
          <span className="text-sm font-semibold text-danger" role="alert">
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
