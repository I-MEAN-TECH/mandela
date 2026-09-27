"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mandela/ui";

/**
 * /register — three steps on one page (progressive disclosure, not a wizard:
 * each step fits one screen). SIMPLICITY law: plain words, big targets,
 * one primary action per step.
 *   1. Door — "I run a school" / "I work at a school"
 *   2. Account — name/email/password (+ role grid for staff, school name for admin)
 *   3. Connect — join code (staff) or claim + share code (admin)
 */

const JOIN_ROLES: { key: string; label: string; blurb: string }[] = [
  { key: "teacher", label: "Teacher", blurb: "Attendance, homework, my class" },
  { key: "principal", label: "Principal", blurb: "Approvals, discipline, insights" },
  { key: "bursar", label: "Bursar", blurb: "Fees, payments, reconciliation" },
  { key: "counter", label: "Counter (front desk)", blurb: "Visitors, calls, admissions" },
  { key: "driver", label: "Driver", blurb: "Routes, manifests, trips" },
  { key: "dorm_parent", label: "Dorm parent", blurb: "Rollcall, exeats, laundry" },
  { key: "janitor", label: "Janitor", blurb: "Repairs, supplies, zones" },
  { key: "librarian", label: "Librarian", blurb: "Issues, returns, overdue" },
  { key: "patron", label: "Patron", blurb: "Houses, sections, points" },
  { key: "hod", label: "HOD", blurb: "Department marks & coverage" },
];

type Step = "door" | "account" | "connect" | "done";

export function RegisterClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("door");
  const [door, setDoor] = useState<"staff" | "school" | null>(null);
  const [role, setRole] = useState<string>("teacher");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // account fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // admin-only
  const [schoolName, setSchoolName] = useState("");
  const [alsoPrincipal, setAlsoPrincipal] = useState(false);
  // staff connect
  const [code, setCode] = useState("");
  const [schoolFound, setSchoolFound] = useState<string | null>(null);
  // success
  const [joinedAs, setJoinedAs] = useState<string>("");
  const [newCode, setNewCode] = useState<string>("");

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await r.json()) as { ok: boolean; error?: string; role?: string; joinCode?: string };
  }

  async function lookupCode(raw: string) {
    const clean = raw.trim().toUpperCase();
    if (clean.length < 6) { setSchoolFound(null); return; }
    const r = await post({ kind: "lookup", code: clean });
    if (r.ok) {
      setSchoolFound((r as unknown as { name: string }).name);
      setError(null);
    } else {
      setSchoolFound(null);
      if (clean.length >= 12) setError(r.error ?? "Unknown school code");
    }
  }

  async function submitStaff() {
    setBusy(true); setError(null);
    const res = await post({ kind: "staff", fullName, email, phone, role, code, password });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Could not join — check the details."); return; }
    setJoinedAs(role);
    setStep("done");
  }

  async function submitSchool() {
    setBusy(true); setError(null);
    const res = await post({ kind: "school", fullName, email, phone, password, schoolName, alsoPrincipal });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Could not set up the school."); return; }
    setNewCode(res.joinCode ?? "");
    setJoinedAs("admin");
    setStep("done");
  }

  function goDashboard() {
    startTransition(() => router.push("/app"));
  }

  const inputCls =
    "h-12 w-full rounded-sm border border-paper-300 bg-surface px-4 text-[14px] text-text outline-none transition-colors placeholder:text-ink-300 focus:border-primary";

  return (
    <div className="w-full max-w-md" data-testid="register-client">
      {/* 1 — DOOR */}
      {step === "door" ? (
        <>
          <h2 className="display text-[28px] leading-tight text-ink-950">Start in <em>one minute.</em></h2>
          <p className="mt-2 text-sm text-muted">What brings you to {`the school platform`}? Parents sign in from the login page — no account needed.</p>
          <div className="mt-s5 grid gap-3">
            <button
              type="button"
              data-testid="door-staff"
              onClick={() => { setDoor("staff"); setRole("teacher"); setStep("account"); }}
              className="flex min-h-[84px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 text-left transition-all hover:-translate-y-px hover:bg-paper-50 hover:shadow-1"
            >
              <span>
                <span className="block text-[15px] font-semibold text-ink-950">I work at a school</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">Join with your school&apos;s code</span>
              </span>
              <span aria-hidden className="text-primary">→</span>
            </button>
            <button
              type="button"
              data-testid="door-school"
              onClick={() => { setDoor("school"); setStep("account"); }}
              className="flex min-h-[84px] items-center justify-between rounded border border-paper-300 bg-surface px-5 py-4 text-left transition-all hover:-translate-y-px hover:bg-paper-50 hover:shadow-1"
            >
              <span>
                <span className="block text-[15px] font-semibold text-ink-950">I run a school</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">Set up the school and invite your staff</span>
              </span>
              <span aria-hidden className="text-primary">→</span>
            </button>
          </div>
          <p className="mt-s4 text-[12.5px] text-muted">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-pine-700 underline decoration-paper-300 underline-offset-4 hover:decoration-primary">Sign in</a>
          </p>
        </>
      ) : null}

      {/* 2 — ACCOUNT */}
      {step === "account" ? (
        <>
          <h2 className="display text-[28px] leading-tight text-ink-950">Your <em>account.</em></h2>
          <div className="mt-s4 grid gap-3">
            <label className="grid gap-1.5">
              <span className="microlabel">Full name</span>
              <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Grace Wanjiku" autoComplete="name" />
            </label>
            <label className="grid gap-1.5">
              <span className="microlabel">School email</span>
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.ac.ke" autoComplete="email" />
            </label>
            <label className="grid gap-1.5">
              <span className="microlabel">Phone <span className="text-ink-300">(optional)</span></span>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" autoComplete="tel" />
            </label>
            <label className="grid gap-1.5">
              <span className="microlabel">Password</span>
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters, letters and numbers" autoComplete="new-password" />
            </label>
          </div>

          {door === "staff" ? (
            <fieldset className="mt-s5">
              <legend className="microlabel">Your work at the school</legend>
              <div className="mt-2 grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto pr-1" data-testid="role-grid">
                {JOIN_ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={role === r.key}
                    onClick={() => setRole(r.key)}
                    className={`min-h-[72px] rounded border px-3 py-2.5 text-left transition-colors ${
                      role === r.key ? "border-primary bg-paper-100 shadow-1" : "border-paper-300 bg-surface hover:bg-paper-50"
                    }`}
                  >
                    <span className="block text-[13.5px] font-semibold text-ink-950">{r.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{r.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="mt-s5 grid gap-3">
              <label className="grid gap-1.5">
                <span className="microlabel">School name</span>
                <input className={inputCls} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. Mandela Junior School" />
              </label>
              <label className="flex min-h-[44px] items-center gap-3 text-[13.5px] text-text">
                <input type="checkbox" className="h-5 w-5 accent-pine-700" checked={alsoPrincipal} onChange={(e) => setAlsoPrincipal(e.target.checked)} />
                I am also the principal
              </label>
            </div>
          )}

          <div className="mt-s5 flex items-center gap-3">
            <Button
              onClick={() => {
                setError(null);
                if (door === "staff") setStep("connect");
                else submitSchool();
              }}
              disabled={busy || pending}
            >
              {door === "staff" ? "Continue" : busy ? "Working…" : "Set up the school"}
            </Button>
            <button type="button" className="text-[12.5px] font-semibold text-muted underline underline-offset-4 hover:text-text" onClick={() => { setStep("door"); setError(null); }}>
              Back
            </button>
          </div>
          {door === "staff" ? (
            <p className="mt-3 text-[12px] leading-relaxed text-muted">Next: enter the join code from your head of school.</p>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-muted">The school starts fresh — you will get a code to invite staff next.</p>
          )}
        </>
      ) : null}

      {/* 2b — STAFF CONNECT (the school's code) */}
      {step === "connect" ? (
        <>
          <h2 className="display text-[28px] leading-tight text-ink-950">Join <em>your school.</em></h2>
          <p className="mt-2 text-sm text-muted">Enter the code your head of school shared. It looks like MANDELA-XXXX.</p>
          <div className="mt-s4 grid gap-3">
            <label className="grid gap-1.5">
              <span className="microlabel">School code</span>
              <input
                className={`${inputCls} font-mono tracking-[0.08em] uppercase`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onBlur={() => lookupCode(code)}
                placeholder="MANDELA-····"
                autoCapitalize="characters"
                spellCheck={false}
                data-testid="code-input"
              />
            </label>
            {schoolFound ? (
              <p className="text-[13px] font-semibold text-ok" data-testid="school-found">
                Joining <em className="not-italic text-ink-950">{schoolFound}</em> as {JOIN_ROLES.find((r) => r.key === role)?.label ?? role}.
              </p>
            ) : null}
            {error ? <p className="text-[12.5px] font-semibold text-danger" role="alert">{error}</p> : null}
            <div className="mt-1 flex items-center gap-3">
              <Button onClick={submitStaff} disabled={busy || code.trim().length < 6} data-testid="join-button">
                {busy ? "Joining…" : "Join the school"}
              </Button>
              <button type="button" className="text-[12.5px] font-semibold text-muted underline underline-offset-4 hover:text-text" onClick={() => { setStep("account"); setError(null); }}>
                Back
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* 3 — DONE */}
      {step === "done" ? (
        <>
          <h2 className="display text-[28px] leading-tight text-ink-950">
            {door === "school" ? <>Your school is <em>live.</em></> : <>You&apos;re <em>in.</em></>}
          </h2>
          {door === "school" && newCode ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Share this code with your staff. They enter it once, pick their work, and land on their own dashboard.
              </p>
              <div className="mt-s4 flex items-center gap-3 rounded border border-paper-300 bg-paper-50 px-4 py-3.5">
                <span className="numeral text-[22px] font-semibold tracking-[0.08em] text-ink-950" data-testid="new-join-code">{newCode}</span>
                <button
                  type="button"
                  className="ml-auto text-[12px] font-semibold text-pine-700 underline decoration-paper-300 underline-offset-4 hover:decoration-primary"
                  onClick={() => navigator.clipboard?.writeText(newCode).catch(() => undefined)}
                >
                  Copy
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Your dashboard is ready — everything you need, nothing you don&apos;t.</p>
          )}
          <div className="mt-s5">
            <Button onClick={goDashboard} disabled={pending} data-testid="go-dashboard">
              {pending ? "Opening…" : "Go to my dashboard"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
