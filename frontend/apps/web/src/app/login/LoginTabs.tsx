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
  const [nudge, setNudge] = useState(false);

  const form = useForm({
    fields: {
      email: {
        label: "School email",
        validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "must look like name@school — check for typos"),
      },
      password: {
        label: "Password",
        validate: () => null, // legacy accounts may not have one yet — the server decides
      },
      phone: {
        label: "Phone number",
        validate: (v) => {
          const digits = v.replace(/\D/g, "");
          if (!/^(?:254|\+254|0)?(7\d{8}|1\d{8})$/.test(digits)) {
            return "must be a Kenyan number, e.g. 0733 000 001 or 254733000001";
          }
          return null;
        },
      },
    },
    onSubmit: async (values) => {
      setPending(true);
      setServerError(null);
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            tab === "staff"
              ? { kind: "staff", email: (values.email ?? "").trim(), password: (values.password ?? "") || undefined }
              : { kind: "guardian", phone: (values.phone ?? "").trim() },
          ),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; needsPassword?: boolean };
        if (res.ok) {
          if (body.needsPassword) {
            // Signed in on the legacy path — invite the desk to set a real
            // password before their next sign-in (it becomes mandatory then).
            setNudge(true);
            setPending(false);
            return;
          }
          router.push("/app");
          router.refresh();
          return;
        }
        setServerError(body.error ?? "Sign-in failed");
      } catch {
        setServerError("Could not reach the school system");
      } finally {
        setPending(false);
      }
    },
  });

  return (
    <div className="mt-s6">
      {/* segmented pill tabs — comp 04 */}
      <div className="flex gap-1 rounded-pill bg-paper-100 p-1" role="tablist" aria-label="Sign in as">
        {(["staff", "guardian"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-11 flex-1 rounded-pill border-2 text-sm transition-colors ${
              tab === t
                ? "border-primary bg-surface font-semibold text-primary shadow-1"
                : "border-transparent font-medium text-muted hover:text-text"
            }`}
          >
            {t === "staff" ? "I'm staff" : "I'm a guardian"}
          </button>
        ))}
      </div>

      <form onSubmit={form.handleSubmit} noValidate className="mt-s5 space-y-s4">
        <ErrorSummary errors={form.summary} />

        {tab === "staff" ? (
          <>
            <Field name="email" label="School email" error={form.errorFor("email")}>
              <input
                {...form.bind("email")}
                type="email"
                autoComplete="email"
                className={`mt-1.5 ${inputCls(Boolean(form.errorFor("email")))}`}
              />
            </Field>
            <Field name="password" label="Password" hint="Leave empty only if your account has no password yet" error={form.errorFor("password")}>
              <input
                {...form.bind("password")}
                type="password"
                autoComplete="current-password"
                className={`mt-1.5 ${inputCls(Boolean(form.errorFor("password")))}`}
              />
            </Field>
          </>
        ) : (
          <Field name="phone" label="Phone number" hint="07…, 01… or +2547… — any format works" error={form.errorFor("phone")}>
            <input
              {...form.bind("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={`mt-1.5 ${inputCls(Boolean(form.errorFor("phone")))}`}
            />
          </Field>
        )}

        <Button variant="primary" size="lg" type="submit" className="w-full" loading={pending}>
          {pending ? "Signing in…" : "Continue"}
        </Button>

        {serverError ? (
          <p className="text-sm font-semibold text-danger" role="alert">
            {serverError}
          </p>
        ) : null}

        {nudge ? (
          <div className="rounded-sm border border-warn bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-warn" role="status">
            <p className="font-semibold">You're in — one step left.</p>
            <p className="mt-1 text-ink-800">
              This account has no password yet. Open your account menu (top right) and choose <strong>Set password</strong> —
              next sign-in will require it.
            </p>
            <Button variant="primary" size="lg" className="mt-3 w-full" onClick={() => { router.push("/app"); router.refresh(); }}>
              Enter the school
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
