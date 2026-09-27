"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { confirmRoleAndLandAction, redeemLinkCodeAction, changeJoinerRoleAction } from "@/lib/api";

/**
 * StartClient — the interstitial's interactive half.
 *  · staff, un-landed: role confirm + "wrong? undo" + Go to my dashboard
 *  · guardian: the family link-code card ( Redeem the slip from the office )
 */
const JOIN_ROLE_OPTIONS = [
  "teacher",
  "principal",
  "bursar",
  "counter",
  "driver",
  "dorm_parent",
  "janitor",
  "librarian",
  "patron",
  "hod",
] as const;

export function StartClient({
  kind,
  schoolName,
  roleName,
  landing,
  hasHat,
}: {
  kind: "staff" | "guardian";
  schoolName: string;
  roleName: string;
  landing: string;
  hasHat: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function land() {
    start(async () => {
      const r = await confirmRoleAndLandAction();
      if (r.ok) {
        router.replace(r.landing || landing);
        router.refresh();
      } else {
        setMsg(r.error ?? "Could not confirm — try again.");
      }
    });
  }

  return (
    <div className="grid min-h-[60vh] place-items-center px-s5 py-s8">
      <div className="w-full max-w-md">
        <p className="microlabel flex items-center gap-2.5">
          <span aria-hidden className="inline-block h-[1.5px] w-[22px] bg-primary" />
          {kind === "guardian" ? "Family link" : "First sign-in"}
        </p>
        <h1 className="display mt-s3 text-[34px] leading-[1.1] text-ink-950">
          {kind === "guardian" ? (
            <>Link your family.</>
          ) : (
            <>
              You&rsquo;re joining <em>{schoolName}</em>.
            </>
          )}
        </h1>

        {kind === "guardian" ? (
          <GuardianLinkCard onDone={(name) => { setMsg(name ? `${name} is linked — they appear after you sign in again.` : "Linked."); router.refresh(); }} />
        ) : (
          <Card className="mt-s5">
            <CardHead
              title={`You're joining as ${roleName || "staff"}.`}
              sub={`At ${schoolName}. This is the role the school registered you under — it shapes your dashboard and what you can change.`}
            />
            <div className="flex flex-wrap items-center gap-s3">
              <Button onClick={land} disabled={pending}>
                {pending ? "One moment…" : "Go to my dashboard"}
              </Button>
              <UndoRole onDone={() => setMsg("Role changed — check it, then continue.")} />
            </div>
            {hasHat ? (
              <p className="mt-s3 text-[12.5px] text-muted">
                You also hold the <strong>Principal</strong> hat — the Principal sections appear on your Pulse.
              </p>
            ) : null}
          </Card>
        )}

        {msg ? (
          <p className="mt-s4 text-[13px] text-ok" role="status">
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function UndoRole({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("teacher");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    start(async () => {
      const r = await changeJoinerRoleAction({ role });
      setErr(r.ok ? null : r.error ?? "Failed");
      if (r.ok) {
        setOpen(false);
        onDone();
      }
    });
  }

  if (!open) {
    return (
      <button
        className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary"
        onClick={() => setOpen(true)}
      >
        Wrong role? Undo
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="joiner-role">Correct role</label>
      <select
        id="joiner-role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="h-11 rounded-sm border border-border bg-surface px-3 text-[13px] text-ink-950"
      >
        {JOIN_ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
        ))}
      </select>
      <Button variant="secondary" onClick={save} disabled={pending}>
        {pending ? "…" : "That's me"}
      </Button>
    </div>
  );
}

function GuardianLinkCard({ onDone }: { onDone: (learner: string) => void }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function redeem() {
    start(async () => {
      const r = await redeemLinkCodeAction(code);
      if (r.ok) {
        onDone(r.learner ?? "");
      } else {
        setErr(r.error ?? "That code did not match.");
      }
    });
  }

  return (
    <Card className="mt-s5">
      <CardHead
        title="Enter the code from the school office"
        sub="One-time code on your admission slip — it links your child to this phone number. After that, sign in and their fees, homework and updates appear here."
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="link-code">Family link code</label>
        <input
          id="link-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ML-XXXXXXXX"
          autoComplete="off"
          className="h-11 w-48 rounded-sm border border-border bg-surface px-3 font-mono text-[13px] uppercase tracking-wider text-ink-950 placeholder:text-muted"
        />
        <Button onClick={redeem} disabled={pending || code.trim().length < 4}>
          {pending ? "Checking…" : "Link my child"}
        </Button>
      </div>
      {err ? (
        <p className="mt-s3 text-[13px] text-danger" role="alert">{err}</p>
      ) : null}
      <p className="mt-s3 text-[12px] text-muted">
        No code? The office keeps a copy — ask at the front desk.
      </p>
    </Card>
  );
}
