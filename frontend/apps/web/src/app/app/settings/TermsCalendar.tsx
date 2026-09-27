"use client";

import { useState, useTransition } from "react";
import { Button, StatusPill, EmptyState, DataTable } from "@mandela/ui";
import { ErrorSummary, useForm, Field, inputCls } from "@/components/Form";
import type { TermsData } from "@/lib/api";
import { upsertTermAction } from "@/lib/api";

/**
 * TermsCalendar — the school's clock, in the reference skin: a white card
 * with the year summary, the term table (lime "running" pill) and the
 * add/update form born on the form standard (radios-not-dropdowns where
 * few options, label-above, format hints, error summary).
 */
export function TermsCalendar({ initial }: { initial: TermsData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const currentYear = new Date().getFullYear();
  const yearChoices = [currentYear, currentYear + 1].map((y) => ({ v: String(y), label: String(y) }));
  const termChoices = [
    { v: "Term 1", label: "Term 1" },
    { v: "Term 2", label: "Term 2" },
    { v: "Term 3", label: "Term 3" },
  ];

  const form = useForm({
    fields: {
      year: { label: "Year", required: true },
      label: { label: "Term", required: true },
      startsOn: {
        label: "Opening date",
        required: true,
        validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "must be a real date (YYYY-MM-DD)"),
      },
      endsOn: {
        label: "Closing date",
        required: true,
        validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "must be a real date (YYYY-MM-DD)"),
      },
    },
    initial: { year: String(currentYear), label: "Term 1" },
    onSubmit: (values) => {
      setBanner(null);
      startTransition(async () => {
        const r = await upsertTermAction({
          year: Number(values.year),
          label: values.label ?? "Term 1",
          startsOn: values.startsOn ?? "",
          endsOn: values.endsOn ?? "",
        });
        const yearLabel = values.year ?? String(currentYear);
        const termLabel = values.label ?? "Term 1";
        if (r.ok) {
          setBanner({ tone: "ok", text: `${termLabel} ${yearLabel} saved — billing, attendance and assessments now key off it.` });
          form.reset();
          // Refresh the read straight from the API.
          const { getTerms } = await import("@/lib/api");
          const fresh = await getTerms();
          if (!("error" in fresh)) setData(fresh);
        } else {
          setBanner({ tone: "danger", text: r.error ?? "Could not save the term." });
        }
      });
    },
  });

  return (
    <div className="grid gap-s3h lg:grid-cols-[1fr_380px]">
      <div className="grid gap-s3h">
        <div className="grid gap-s3h sm:grid-cols-2">
          {data.terms.filter((t) => t.is_current).map((t) => (
            <div key={t.id} className="rounded border border-border bg-surface p-s5 shadow-1">
              <p className="text-[13px] font-medium text-muted">{t.label} · {t.year}</p>
              <p className="numeral mt-s3 text-num font-semibold text-ink-950">
                {t.days_left ?? "—"}
              </p>
              <p className="mt-1 text-[12.5px] text-muted">days left · closes {fmtDate(t.ends_on)}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded border border-border bg-surface shadow-1">
          <div className="flex items-center justify-between gap-s3 border-b border-border p-s5 pb-s4">
            <div>
              <h2 className="font-display text-[17px] font-semibold text-ink-950">The calendar</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {data.years.length} year{data.years.length === 1 ? "" : "s"} · {data.terms.length} term{data.terms.length === 1 ? "" : "s"} on record
              </p>
            </div>
          </div>
          {data.terms.length === 0 ? (
            <div className="p-s5">
              <EmptyState
                title="No terms yet"
                body="Add the first term with the form — billing, attendance and assessments all key off it."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Term", "Opens", "Closes", "Status"].map((h, right) => (
                      <th key={h} className={`microlabel px-s5 py-s3 ${right === 3 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.terms.map((t) => (
                    <tr key={t.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-50">
                      <td className="px-s5 py-s3 text-[13.5px] font-semibold">{t.label} <span className="font-normal text-muted">· {t.year}</span></td>
                      <td className="px-s5 py-s3 text-[13.5px]">{fmtDate(t.starts_on)}</td>
                      <td className="px-s5 py-s3 text-[13.5px]">{fmtDate(t.ends_on)}</td>
                      <td className="px-s5 py-s3 text-right">
                        {t.is_current ? (
                          <StatusPill tone="ok">running · {t.days_left} days left</StatusPill>
                        ) : new Date(t.ends_on) < new Date() ? (
                          <StatusPill tone="neutral">closed</StatusPill>
                        ) : (
                          <StatusPill tone="warn">upcoming</StatusPill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* The form — one column, label above, format hints, error summary */}
      <div className="rounded border border-border bg-surface p-s5 shadow-1 lg:sticky lg:top-6 lg:self-start">
        <h2 className="font-display text-[17px] font-semibold text-ink-950">Add or update a term</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Same year + term name updates the dates — nothing duplicates.</p>

        {banner ? (
          <div
            role="status"
            className={`mt-s3 rounded-sm p-3 text-[13px] font-medium ${
              banner.tone === "ok" ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"
            }`}
          >
            {banner.text}
          </div>
        ) : null}

        <form className="mt-s4 grid gap-s4" onSubmit={form.handleSubmit} noValidate>
          <ErrorSummary errors={form.summary} />
          <fieldset>
            <legend className="text-[13px] font-semibold">Year</legend>
            <div className="mt-1.5 flex gap-2">
              {yearChoices.map((y) => (
                <label
                  key={y.v}
                  className={`inline-flex h-12 cursor-pointer items-center rounded-sm border px-4 text-sm font-semibold transition-colors ${
                    form.values.year === y.v ? "border-2 border-primary bg-primary-soft text-primary" : "border-border bg-surface text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  <input type="radio" name="year" value={y.v} checked={form.values.year === y.v} onChange={() => form.setValue("year", y.v)} className="sr-only" />
                  {y.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[13px] font-semibold">Term</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {termChoices.map((t) => (
                <label
                  key={t.v}
                  className={`inline-flex h-12 cursor-pointer items-center rounded-sm border px-4 text-sm font-semibold transition-colors ${
                    form.values.label === t.v ? "border-2 border-primary bg-primary-soft text-primary" : "border-border bg-surface text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  <input type="radio" name="label" value={t.v} checked={form.values.label === t.v} onChange={() => form.setValue("label", t.v)} className="sr-only" />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field name="startsOn" label="Opening date" hint="The day the term opens." error={form.errorFor("startsOn") ?? undefined}>
            <input type="date" {...form.bind("startsOn")} className={inputCls(!!form.errorFor("startsOn"))} />
          </Field>
          <Field name="endsOn" label="Closing date" hint="The day the term closes — the clock every other module reads." error={form.errorFor("endsOn") ?? undefined}>
            <input type="date" {...form.bind("endsOn")} className={inputCls(!!form.errorFor("endsOn"))} />
          </Field>
          <Button type="submit" variant="primary" loading={pending}>
            Save the term
          </Button>
        </form>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}
