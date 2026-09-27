"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHead, StatusPill } from "@mandela/ui";
import type { OnboardingState } from "@/lib/api";

/**
 * OnboardingWizard — Phase 4: a fresh school finishes setup without a manual.
 * A 5-step deep-link checklist on the admin Pulse (school profile → curriculum
 * pack → open term → fee structure → learners CSV import). Every step reuses an
 * existing screen — the wizard is the map, not new forms. Visible until 5/5;
 * after completion it flips to a dismissible "setup complete" card (dismiss is
 * per-admin via localStorage).
 */
const DISMISS_KEY = "mandela_onboarding_dismissed";

export function OnboardingWizard({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true); // SSR-safe: hidden until mounted
  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed) return null;

  const done = state.steps_done >= 5;
  const steps = [
    {
      label: "School profile",
      hint: state.profile_done ? "Name, county and phone saved" : "Add the school name, county and phone",
      done: state.profile_done,
      href: "/app/settings",
    },
    {
      label: "Curriculum pack",
      hint: state.pack_code ? `Attached: ${state.pack_code}` : "Attach the CBC pack for your school",
      done: Boolean(state.pack_code),
      href: "/app/academics/curriculum",
    },
    {
      label: "Open term",
      hint: state.term_open ? "A term is running today" : "Set the term dates so billing can start",
      done: state.term_open,
      href: "/app/settings",
    },
    {
      label: "Fee structure",
      hint: state.structures > 0 ? `${state.structures} structure${state.structures === 1 ? "" : "s"} saved` : "Set class fees, then apply them",
      done: state.structures > 0,
      href: "/app/money/fees",
    },
    {
      label: "Learners on roll",
      hint: state.learners > 0 ? `${state.learners} active — import more any time` : "Import learners from a CSV in one go",
      done: state.learners > 0,
      href: "/app/people/learners",
    },
  ];

  return (
    <Card>
      <CardHead
        title={done ? "Setup complete" : "Finish setting up your school"}
        sub={done ? "Every step is done — this card can go now." : `${state.steps_done} of 5 steps done — pick up where you left off.`}
      />
      <ol className="grid gap-s2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="flex items-center justify-between gap-s3 rounded-sm border border-border bg-paper-50 px-s3 py-s2 no-underline transition-colors hover:border-pine-300 hover:bg-paper-100"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink-950">{s.label}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">{s.hint}</span>
              </span>
              <StatusPill tone={s.done ? "ok" : "warn"}>{s.done ? "done" : "to do"}</StatusPill>
            </Link>
          </li>
        ))}
      </ol>
      {done ? (
        <div className="mt-s3 flex items-center justify-between border-t border-border pt-s3">
          <p className="text-[12px] text-muted">Dismissing keeps everything where it is — the screens never move.</p>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
              router.refresh();
            }}
            className="rounded-sm border border-border bg-surface px-s3 py-s1.5 text-[12.5px] font-semibold text-ink-900 hover:border-pine-300"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </Card>
  );
}
