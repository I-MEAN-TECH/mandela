"use client";

import { useState, useTransition } from "react";
import { Button } from "@mandela/ui";
import { ErrorSummary, Field, useForm, inputCls } from "@/components/Form";
import type { ClassRow } from "@/lib/api";

export function HomeworkForm({
  classes,
  action,
}: {
  classes: ClassRow[];
  action: (input: { classId: number; subject: string; title: string; body: string; dueOn?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const form = useForm({
    fields: {
      classId: { label: "Class", required: true },
      subject: {
        label: "Subject",
        required: true,
        validate: (v) => (v.trim().length < 2 ? "must be at least 2 characters" : null),
      },
      title: {
        label: "Title",
        required: true,
        validate: (v) => (v.trim().length < 3 ? "must be at least 3 characters" : null),
      },
      body: { label: "Instructions", required: true },
      dueOn: { label: "Due date" },
    },
    onSubmit: (values) =>
      start(async () => {
        const res = await action({
          classId: Number(values.classId || classes[0]?.id || 0),
          subject: values.subject ?? "",
          title: values.title ?? "",
          body: values.body ?? "",
          dueOn: values.dueOn || undefined,
        });
        setMsg(res.ok ? "Homework set — done" : (res.error ?? "Failed to save"));
        if (res.ok) {
          form.setValue("title", "");
          form.setValue("body", "");
        }
      }),
  });

  const submitError = msg && !msg.endsWith(" — done") ? msg : null;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="grid gap-s3h">
      <ErrorSummary errors={form.summary} />

      <Field name="classId" label="Class" error={form.errorFor("classId")}>
        <select {...form.bind("classId")} className={inputCls(Boolean(form.errorFor("classId")))}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        name="subject"
        label="Subject"
        hint="The learning area this homework belongs to, e.g. Mathematics"
        error={form.errorFor("subject")}
      >
        <input {...form.bind("subject")} className={inputCls(Boolean(form.errorFor("subject")))} />
      </Field>

      <Field name="title" label="Title" hint="e.g. Fractions worksheet 3" error={form.errorFor("title")}>
        <input {...form.bind("title")} className={inputCls(Boolean(form.errorFor("title")))} />
      </Field>

      <Field name="body" label="Instructions" error={form.errorFor("body")}>
        <textarea
          {...form.bind("body")}
          rows={3}
          className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3.5 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field name="dueOn" label="Due date" optional hint="Leave empty if there is no deadline">
        <input type="date" {...form.bind("dueOn")} className={inputCls(false)} />
      </Field>

      {submitError ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center gap-s3">
        <Button variant="primary" size="md" type="submit" disabled={pending || classes.length === 0}>
          {pending ? "Setting…" : "Set homework"}
        </Button>
        {msg && msg.endsWith(" — done") ? (
          <span className="text-sm font-semibold text-ok" role="status">
            {msg}
          </span>
        ) : null}
      </div>
    </form>
  );
}
