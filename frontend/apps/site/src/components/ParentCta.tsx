"use client";

import { useState } from "react";
import { appLinks } from "@/lib/appLinks";

/**
 * The phone-first hero action for parents: enter the phone the school has on
 * file, receive a login code on WhatsApp/SMS. Posts to the product app's
 * OTP endpoint; the site itself keeps zero client state beyond this form.
 */
export function ParentCta() {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [note, setNote] = useState<string>("");

  async function send() {
    setState("sending");
    try {
      // Same-origin proxy (see next.config.ts rewrites) → product OTP API.
      const r = await fetch("/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", identifier: phone, purpose: "guardian" }),
      });
      if (!r.ok) throw new Error("failed");
      setState("sent");
    } catch {
      setState("error");
      setNote("Could not send right now — the school can also help you from the office.");
    }
  }

  const inputCls =
    "h-13 min-h-[52px] w-full rounded-pill border border-paper-400 bg-surface px-5 text-[15px] text-text outline-none transition-colors placeholder:text-ink-300 focus:border-primary";

  if (state === "sent") {
    return (
      <div className="rounded border border-paper-300 bg-surface px-5 py-4 shadow-1" role="status">
        <p className="text-[14px] font-semibold text-ink-950">Check your phone 📲</p>
        <p className="mt-1 text-[13px] text-muted">
          We sent a login code to {phone}. Enter it on the next screen to see your
          children&apos;s balances, homework and attendance.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="microlabel mb-2">Parents</p>
      <div className="flex gap-2">
        <input
          className={inputCls}
          inputMode="tel"
          autoComplete="tel"
          placeholder="07xx xxx xxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Your phone number"
        />
        <button
          type="button"
          onClick={send}
          disabled={phone.replace(/\D/g, "").length < 9 || state === "sending"}
          className="shrink-0 rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {state === "sending" ? "Sending…" : "Get my code"}
        </button>
      </div>
      {state === "error" ? <p className="mt-2 text-[12.5px] font-semibold text-danger" role="alert">{note}</p> : null}
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Your children appear automatically — the school links them. No password to remember.
      </p>
    </div>
  );
}
