"use client";

import { useState, useTransition } from "react";
import { Button, StatusPill } from "@mandela/ui";
import { ErrorSummary, Field, useForm, inputCls } from "@/components/Form";
import { createStaffAction, updateStaffAction } from "@/lib/api";

const ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "bursar", label: "Bursar" },
  { value: "principal", label: "Principal" },
  { value: "admin", label: "Admin" },
  { value: "counter", label: "Counter" },
  { value: "driver", label: "Driver" },
] as const;

export function AddStaffForm({ classCodes }: { classCodes: { code: string; name: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const form = useForm({
    fields: {
      fullName: {
        label: "Full name",
        required: true,
        validate: (v) => (v.trim().length < 3 ? "must be at least 3 characters" : null),
      },
      email: {
        label: "School email",
        required: true,
        validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "must look like name@school"),
      },
      phone: {
        label: "Phone",
        validate: (v) => {
          if (!v.trim()) return null; // optional
          const digits = v.replace(/\D/g, "");
          return /^(?:254|\+254|0)?[17]\d{8}$/.test(digits) ? null : "must be a Kenyan number, e.g. 0712 345 678";
        },
      },
      role: { label: "Role" },
      classes: { label: "Classes" },
      tscNo: { label: "TSC number" },
      nationalId: { label: "National ID" },
    },
    initial: { role: "teacher" },
    onSubmit: (values) =>
      start(async () => {
        const res = await createStaffAction({
          fullName: (values.fullName ?? "").trim(),
          email: (values.email ?? "").trim(),
          phone: values.phone ? values.phone.trim() : undefined,
          role: values.role || "teacher",
          classes: values.classes ? values.classes.split(",").map((c) => c.trim()).filter(Boolean) : [],
          tscNo: values.tscNo ? values.tscNo.trim() : undefined,
          nationalId: values.nationalId ? values.nationalId.trim() : undefined,
        });
        if (res.ok) {
          setMsg(`${values.fullName} added to the register`);
          form.reset();
        } else {
          setMsg(res.error ?? "Could not add staff");
        }
      }),
  });

  return (
    <form onSubmit={form.handleSubmit} noValidate className="grid gap-s3h">
      <ErrorSummary errors={form.summary} />

      <Field name="fullName" label="Full name" error={form.errorFor("fullName")}>
        <input {...form.bind("fullName")} autoComplete="off" className={inputCls(Boolean(form.errorFor("fullName")))} />
      </Field>

      <Field name="email" label="School email" hint="This is how the staff member signs in (dev)" error={form.errorFor("email")}>
        <input {...form.bind("email")} type="email" autoComplete="off" className={inputCls(Boolean(form.errorFor("email")))} />
      </Field>

      <Field name="phone" label="Phone" optional hint="07… / 01… / +2547…" error={form.errorFor("phone")}>
        <input {...form.bind("phone")} type="tel" autoComplete="off" className={inputCls(Boolean(form.errorFor("phone")))} />
      </Field>

      <Field name="role" label="Role" error={form.errorFor("role")}>
        <select {...form.bind("role")} className={inputCls(Boolean(form.errorFor("role")))}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </Field>

      <Field
        name="classes"
        label="Classes taught"
        optional
        hint={classCodes.length > 0 ? `Comma-separated codes, e.g. ${classCodes.map((c) => c.code).join(", ")}` : "Leave empty for non-teaching roles"}
        error={form.errorFor("classes")}
      >
        <input {...form.bind("classes")} autoComplete="off" className={inputCls(Boolean(form.errorFor("classes")))} />
      </Field>

      <div className="grid gap-s3h sm:grid-cols-2">
        <Field name="tscNo" label="TSC number" optional hint="Teachers Service Commission registration" error={form.errorFor("tscNo")}>
          <input {...form.bind("tscNo")} autoComplete="off" className={inputCls(Boolean(form.errorFor("tscNo")))} />
        </Field>
        <Field name="nationalId" label="National ID" optional hint="Needed for KEMIS staff registration" error={form.errorFor("nationalId")}>
          <input {...form.bind("nationalId")} autoComplete="off" className={inputCls(Boolean(form.errorFor("nationalId")))} />
        </Field>
      </div>

      {msg ? (
        <p role="status" className={`text-sm font-semibold ${msg.endsWith(" — done") ? "text-ok" : "text-danger"}`}>
          {msg}
        </p>
      ) : null}

      <div>
        <Button variant="primary" size="md" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add to register"}
        </Button>
      </div>
    </form>
  );
}

export function StaffRowActions({
  id,
  active,
  role,
  isLastPrincipal,
}: {
  id: string;
  active: boolean;
  role: string;
  isLastPrincipal: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const res = await updateStaffAction({ id, active: !active });
      setMsg(res.ok ? null : (res.error ?? "Update failed"));
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {msg ? <span className="text-xs font-semibold text-danger">{msg}</span> : null}
      {role === "principal" && active && isLastPrincipal ? (
        <span className="text-xs text-muted">last principal</span>
      ) : (
        <button
          onClick={toggle}
          disabled={pending}
          className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold hover:bg-paper-100 disabled:opacity-50"
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
      )}
    </div>
  );
}
