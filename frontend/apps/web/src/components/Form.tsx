"use client";

import { useCallback, useState } from "react";

/**
 * Form standard — docs/FORM-NAV-STANDARDS.md made code.
 * Evidence-based rules (NN/g, GOV.UK, Baymard, CHI'14):
 *   one column · label above · no placeholders · required-by-omission ·
 *   format hints up front · validate on submit + on-blur (never mid-typing) ·
 *   error summary + per-field errors · never clear entries · no reset ·
 *   radios for few options · steps + check-answers for long forms.
 *
 * Zero dependencies. New forms MUST use this; deviations need a documented
 * reason in docs/FORM-NAV-STANDARDS.md.
 */

// ---------------------------------------------------------------------------
// Error summary — GOV.UK pattern: focus moves here on failed submit.
// ---------------------------------------------------------------------------

export interface FieldError {
  field: string;   // input name/id
  label: string;   // human label used in the summary link
  message: string; // how to fix it
}

export function ErrorSummary({ errors }: { errors: FieldError[] }) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      data-error-summary
      className="rounded-sm border-l-4 border-danger bg-danger/5 p-4"
    >
      <h2 className="text-sm font-bold text-danger">There is a problem</h2>
      <ul className="mt-2 space-y-1">
        {errors.map((e) => (
          <li key={e.field}>
            <a
              href={`#${e.field}`}
              className="text-sm font-semibold text-danger underline decoration-danger/40 hover:decoration-danger"
              onClick={(ev) => {
                ev.preventDefault();
                const el = document.getElementById(e.field);
                el?.focus();
                el?.scrollIntoView({ block: "center" });
              }}
            >
              {e.label} — {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useForm — field state, submit-time validation, on-blur (after) validation.
// ---------------------------------------------------------------------------

export interface FieldSpec {
  label: string;
  required?: boolean;
  /** Return an error message when the value is invalid (on blur or submit). */
  validate?: (value: string) => string | null;
}

type InputElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function useForm(opts: {
  fields: Record<string, FieldSpec>;
  /** Starting values — use for selects that must default to a real option. */
  initial?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
}) {
  const { fields, onSubmit } = opts;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(Object.keys(fields).map((k) => [k, ""])),
    ...opts.initial,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = useCallback(
    (name: string, value: string): string | null => {
      const spec = fields[name];
      if (!spec) return null;
      const empty = value.trim() === "";
      if (spec.required && empty) return "is required";
      if (!empty && spec.validate) return spec.validate(value);
      return null;
    },
    [fields],
  );

  const runAndSet = useCallback(
    (name: string, value: string) => {
      const msg = validateField(name, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (msg) next[name] = msg;
        else delete next[name];
        return next;
      });
    },
    [validateField],
  );

  const setValue = useCallback(
    (name: string, value: string) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      // re-check live only a field that already has an error, so errors
      // clear the moment the user fixes them (never added mid-typing)
      setErrors((prev) => {
        if (!prev[name]) return prev;
        const msg = validateField(name, value);
        const next = { ...prev };
        if (msg) next[name] = msg;
        else delete next[name];
        return next;
      });
    },
    [validateField],
  );

  const bind = useCallback(
    (name: string) => ({
      id: name,
      name,
      value: values[name] ?? "",
      onChange: (e: React.ChangeEvent<InputElement>) => setValue(name, e.target.value),
      onBlur: () => runAndSet(name, values[name] ?? ""),
      "aria-invalid": Boolean(errors[name]),
      "aria-describedby": errors[name] ? `${name}-error` : undefined,
    }),
    [values, errors, setValue, runAndSet],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const nextErrors: Record<string, string> = {};
      for (const name of Object.keys(fields)) {
        const msg = validateField(name, values[name] ?? "");
        if (msg) nextErrors[name] = msg;
      }
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        // move focus to the summary block (GOV.UK pattern)
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>("[data-error-summary]")?.focus();
        });
        return;
      }
      void onSubmit(values);
    },
    [fields, values, validateField, onSubmit],
  );

  const summary: FieldError[] = Object.entries(errors).map(([field, message]) => ({
    field,
    label: fields[field]?.label ?? field,
    message,
  }));

  return {
    values,
    setValue,
    errors,
    summary,
    handleSubmit,
    bind,
    errorFor: (name: string) => errors[name],
    reset: () => {
      setValues({
        ...Object.fromEntries(Object.keys(fields).map((k) => [k, ""])),
        ...opts.initial,
      });
      setErrors({});
    },
  };
}

// ---------------------------------------------------------------------------
// Field — label above, hint below label, error message below input.
// ---------------------------------------------------------------------------

export function Field({
  name,
  label,
  hint,
  error,
  optional,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <label htmlFor={name} className="block text-[13px] font-semibold">
        {label}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs font-semibold text-danger">
          <span aria-hidden role="img" aria-label="Warning">!</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shared input classes — full width, visible focus, error state aware. */
export function inputCls(hasError?: boolean): string {
  return [
    "mt-1.5 h-12 w-full rounded-sm border bg-surface px-3.5 text-sm outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring",
    hasError ? "border-danger ring-1 ring-danger" : "border-border",
  ].join(" ");
}
