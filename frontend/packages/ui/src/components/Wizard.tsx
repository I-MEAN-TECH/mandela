"use client";

import { useMemo, useRef, useState } from "react";

/**
 * Wizard — docs/SIMPLICITY.md Rule 3 made code.
 * A step-based form for anything with more than 3 inputs:
 *
 *   ① Who  →  ② How much  →  ③ Check answers  →  ✔ done
 *
 * Evidence base (NN/g, GOV.UK): one question per screen, Back is always
 * safe, a check-answers step before the write, Change links per answer,
 * and a success state that shows the artifact (receipt number) plus the
 * next action. Zero dependencies; works without JS motion on 3G phones.
 */

export interface WizardStep {
  /** Shown in the progress strip and the check-answers Change links. */
  title: string;
  /** One-line reassurance under the title (plain language, no jargon). */
  hint?: string;
  /** The step's content. Render your inputs; use useWizardStep() to go next. */
  content: React.ReactNode;
  /** Return an error message to keep the user here; null to advance. */
  validate?: () => string | null;
  /** Answers shown on the check-answers step (label → value). */
  answers?: { label: string; value: string }[];
}

export interface WizardProps {
  steps: WizardStep[];
  /** Called on the final Continue — return the success artifact. */
  onConfirm: () => Promise<string | null>;
  /** Headline of the done state. `receipt` shows in the big mono box. */
  doneTitle: string;
  doneHint?: string;
  /** Renders the next-action buttons on the done screen (start again, etc). */
  renderDoneActions?: () => React.ReactNode;
}

export function Wizard({ steps, onConfirm, doneTitle, doneHint, renderDoneActions }: WizardProps) {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The check-answers screen comes AFTER every content step — a separate
  // index, not the last content step's slot (which used to swallow the final
  // step's content when a wizard had 3+ steps).
  const last = steps.length - 1;
  const isCheck = index > last;
  const step = steps[Math.min(index, last)]!;

  const focusHeading = () => {
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  if (receipt !== null) {
    return (
      <div className="rounded-sm border border-ok/30 bg-ok/5 p-s5 text-center" role="status">
        <p className="text-3xl font-bold text-ok" aria-hidden>
          <DoneGlyph />
        </p>
        <h3 className="mt-2 text-lg font-bold">{doneTitle}</h3>
        <p className="mx-auto mt-2 max-w-sm font-mono text-lg font-semibold tracking-wide">{receipt}</p>
        {doneHint ? <p className="mt-2 text-sm text-muted">{doneHint}</p> : null}
        {renderDoneActions ? <div className="mt-s4 flex flex-wrap items-center justify-center gap-s3">{renderDoneActions()}</div> : null}
      </div>
    );
  }

  return (
    <div>
      {/* Progress strip — the user always knows where they are */}
      <ol className="flex flex-wrap items-center gap-2" aria-label={`Step ${Math.min(index + 1, steps.length + 1)} of ${steps.length + 1}`}>
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-2">
            <span
              aria-current={i === index ? "step" : undefined}
              className={`flex h-7 items-center gap-1.5 rounded-pill px-3 text-[12px] font-semibold ${
                i === index
                  ? "bg-primary text-on-primary"
                  : i < index
                    ? "bg-ok/10 text-ok"
                    : "border border-border text-muted"
              }`}
            >
              <span
                aria-hidden
                className="grid h-[18px] w-[18px] place-items-center rounded-full bg-white/25 text-[11px] font-bold leading-none"
              >
                {i + 1}
              </span>{" "}
              {s.title}
            </span>
            {i < steps.length - 1 ? <span aria-hidden className="text-muted">›</span> : null}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className={`flex h-7 items-center rounded-pill px-3 text-[12px] font-semibold ${isCheck ? "bg-primary text-on-primary" : "border border-border text-muted"}`}>
            Check
          </span>
        </li>
      </ol>

      <div className="mt-s4">
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-bold outline-none">
          {isCheck ? "Check everything is right" : step.title}
        </h3>
        {!isCheck && step.hint ? <p className="mt-0.5 text-sm text-muted">{step.hint}</p> : null}

        {error ? (
          <p role="alert" className="mt-s3 rounded-sm border-l-4 border-danger bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-s3h">{isCheck ? <CheckAnswers steps={steps} /> : step.content}</div>
      </div>

      <div className="mt-s5 flex items-center gap-s3">
        {index > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIndex(index - 1);
              focusHeading();
            }}
            className="h-11 rounded-pill border border-border px-5 text-sm font-semibold hover:bg-paper-100"
          >
            ‹ Back
          </button>
        ) : null}
        {!isCheck ? (
          <button
            type="button"
            onClick={() => {
              const err = step.validate?.() ?? null;
              if (err) {
                setError(err);
                return;
              }
              setError(null);
              setIndex(index + 1);
              focusHeading();
            }}
            className="h-11 rounded-pill bg-primary px-6 text-sm font-semibold text-on-primary hover:opacity-90"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              onConfirm()
                .then((r) => (r === null ? setError("Could not save — check the details and try again") : setReceipt(r)))
                .finally(() => setBusy(false));
            }}
            className="h-11 rounded-pill bg-primary px-6 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Yes — save it"}
          </button>
        )}
      </div>
    </div>
  );
}

function CheckAnswers({ steps }: { steps: WizardStep[] }) {
  const rows = useMemo(() => steps.flatMap((s) => s.answers ?? []), [steps]);
  return (
    <dl className="overflow-hidden rounded-sm border border-border">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
          <dt className="text-sm text-muted">{r.label}</dt>
          <dd className="text-sm font-semibold">{r.value}</dd>
        </div>
      ))}
      <div className="bg-paper-100 px-4 py-2.5 text-xs text-muted">
        Something wrong? Tap ‹ Back to change any line.
      </div>
    </dl>
  );
}


/** Dependency-free done glyph (ui package carries no icon deps). */
function DoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "inline" }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
