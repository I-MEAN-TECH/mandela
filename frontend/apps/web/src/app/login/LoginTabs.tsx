"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";
import { ErrorSummary, Field, useForm, inputCls } from "@/components/Form";

export function LoginTabs() {
  const router = useRouter();
  const [tab, setTab] = useState<"staff" | "guardian">("staff");
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [guardianCodeSent, setGuardianCodeSent] = useState(false);
  const form = useForm({
    fields: {
      email: { label: "School email", validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "must look like name@school - check for typos") },
      password: { label: "Password", validate: () => null },
      phone: { label: "Phone number", validate: (v) => (/^(?:254|\+254|0)?(?:7\d{8}|1\d{8})$/.test(v.replace(/\D/g, "")) ? null : "use a Kenyan number, for example 0733 000 001") },
      code: { label: "One-time code", validate: (v) => (!guardianCodeSent || /^\d{6}$/.test(v.trim()) ? null : "enter the six-digit code sent to your phone") },
    },
    onSubmit: async (values) => {
      setPending(true); setServerError(null);
      try {
        if (tab === "guardian") {
          const response = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(guardianCodeSent ? { action: "verify", identifier: (values.phone ?? "").trim(), purpose: "guardian", code: (values.code ?? "").trim() } : { action: "request", identifier: (values.phone ?? "").trim(), purpose: "guardian" }) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!response.ok || !body.ok) { setServerError(body.error ?? "Could not send a code. Check the phone number."); return; }
          if (!guardianCodeSent) { setGuardianCodeSent(true); return; }
        } else {
          const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "staff", email: (values.email ?? "").trim(), password: (values.password ?? "").trim() }) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          if (!response.ok || !body.ok) { setServerError(body.error ?? "Sign-in failed"); return; }
        }
        router.push("/app"); router.refresh();
      } catch { setServerError("Could not reach the school system"); }
      finally { setPending(false); }
    },
  });
  return <div className="mt-s6">
    <div className="flex gap-1 rounded-pill bg-paper-100 p-1" role="tablist" aria-label="Sign in as">
      {(["staff", "guardian"] as const).map((kind) => <button key={kind} role="tab" aria-selected={tab === kind} onClick={() => { setTab(kind); setGuardianCodeSent(false); setServerError(null); }} className={`h-11 flex-1 rounded-pill border-2 text-sm transition-colors ${tab === kind ? "border-primary bg-surface font-semibold text-primary shadow-1" : "border-transparent font-medium text-muted hover:text-text"}`}>{kind === "staff" ? "I'm staff" : "I'm a guardian"}</button>)}
    </div>
    <form onSubmit={form.handleSubmit} noValidate className="mt-s5 space-y-s4">
      <ErrorSummary errors={form.summary} />
      {tab === "staff" ? <><Field name="email" label="School email" error={form.errorFor("email")}><input {...form.bind("email")} type="email" autoComplete="email" className={`mt-1.5 ${inputCls(Boolean(form.errorFor("email")))}`} /></Field><Field name="password" label="Password" error={form.errorFor("password")}><input {...form.bind("password")} type="password" autoComplete="current-password" className={`mt-1.5 ${inputCls(Boolean(form.errorFor("password")))}`} /></Field></> : <><Field name="phone" label="Phone number" hint="07..., 01... or +2547... - any format works" error={form.errorFor("phone")}><input {...form.bind("phone")} type="tel" inputMode="tel" autoComplete="tel" className={`mt-1.5 ${inputCls(Boolean(form.errorFor("phone")))}`} /></Field>{guardianCodeSent ? <Field name="code" label="One-time code" hint="Check your phone for the six-digit code" error={form.errorFor("code")}><input {...form.bind("code")} type="text" inputMode="numeric" autoComplete="one-time-code" className={`mt-1.5 ${inputCls(Boolean(form.errorFor("code")))}`} /></Field> : null}</>}
      <Button variant="primary" size="lg" type="submit" className="w-full" loading={pending}>{pending ? "Please wait..." : tab === "guardian" ? (guardianCodeSent ? "Verify code" : "Send code") : "Continue"}</Button>
      {serverError ? <p className="text-sm font-semibold text-danger" role="alert">{serverError}</p> : null}
    </form>
  </div>;
}
