"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Meter, StatusPill, EmptyState } from "@mandela/ui";
import { upsertLearnerAction, type KemisReadinessData } from "@/lib/api";

/**
 * Exam Entries — the KEMIS readiness panel (spec §2.2 slice A½).
 * The market finding in one line: data hygiene literally equals money —
 * no UPI = no national exam entry, and licence renewal asks for the same
 * fields. This panel surfaces the gaps the schema already models
 * (learner.upi, birth_cert_no "entry number", staff national_id) and
 * exports a CSV shaped for kemis.go.ke.
 */
export function ExamEntriesPanel({ data }: { data: KemisReadinessData | { error: string } }) {
  if ("error" in data) {
    return (
      <Card>
        <CardHead title="Exam Entries" sub="KEMIS readiness" />
        <EmptyState title="Could not load readiness" body="The school database did not respond. Try again shortly." />
      </Card>
    );
  }

  const L = data.learners;
  const S = data.staff;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 100);
  const learnerPct = pct(L.with_upi, L.total); // the hard gate — exam entry itself

  return (
    <Card>
      <CardHead
        title="Exam Entries"
        sub="KEMIS readiness — no UPI means no national exam entry, no licence renewal"
        action={
          <StatusPill tone={learnerPct >= 95 ? "ok" : learnerPct >= 70 ? "warn" : "danger"}>
            {learnerPct}% exam-ready
          </StatusPill>
        }
      />

      {/* Completeness meters — the four numbers the owner watches */}
      <div className="grid gap-s4 border-b border-paper-200 pb-s4 sm:grid-cols-2">
        <MeterRow label="UPI assigned" done={L.with_upi} total={L.total} ok={learnerPct >= 95} />
        <MeterRow label="Birth cert entry no" done={L.with_birth_cert} total={L.total} ok={pct(L.with_birth_cert, L.total) >= 95} />
        <MeterRow label="Guardian on file" done={L.with_guardian} total={L.total} ok={pct(L.with_guardian, L.total) >= 95} />
        <MeterRow label="Staff National ID" done={S.with_national_id} total={S.total} ok={pct(S.with_national_id, S.total) >= 95} />
      </div>

      {/* The fix-lists — jump targets, not dashboards */}
      <div className="grid gap-s4 pt-s4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <p className="microlabel">Learners missing exam data · {data.missing_learners.length}</p>
            {data.missing_learners.length > 0 && (
              <KemisCsvButton rows={data.missing_learners} />
            )}
          </div>
          {data.missing_learners.length === 0 ? (
            <p className="mt-2 rounded-sm border border-ok-bg bg-ok-bg px-3 py-2 text-[12.5px] font-semibold text-ok">
              Every active learner is exam-ready.
            </p>
          ) : (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-sm border border-paper-200">
              <table className="w-full text-left text-[12.5px]">
                <thead className="sticky top-0 bg-paper-100">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Learner</th>
                    <th className="px-3 py-2 font-semibold">Class</th>
                    <th className="px-3 py-2 font-semibold">Missing</th>
                    <th className="px-3 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.missing_learners.map((l) => (
                    <tr key={l.id} className="border-t border-paper-200">
                      <td className="px-3 py-2">
                        <span className="font-semibold">{l.name}</span>
                        <span className="ml-2 font-mono text-[10.5px] text-muted">{l.admission_no}</span>
                      </td>
                      <td className="px-3 py-2 text-muted">{l.class ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {l.missing.map((m) => (
                            <span key={m} className="rounded-pill bg-warn-bg px-2 py-0.5 text-[10.5px] font-semibold text-warn">{m}</span>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <FixLearnerButton learner={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="microlabel">Staff missing register fields · {data.missing_staff.length}</p>
          {data.missing_staff.length === 0 ? (
            <p className="mt-2 rounded-sm border border-ok-bg bg-ok-bg px-3 py-2 text-[12.5px] font-semibold text-ok">
              Register complete.
            </p>
          ) : (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-sm border border-paper-200">
              <table className="w-full text-left text-[12.5px]">
                <tbody>
                  {data.missing_staff.map((s) => (
                    <tr key={s.id} className="border-t border-paper-200 first:border-t-0">
                      <td className="px-3 py-2">
                        <span className="font-semibold">{s.name}</span>
                        <span className="ml-2 text-[10.5px] text-muted">{s.role}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {s.missing.map((m) => (
                            <span key={m} className="rounded-pill bg-warn-bg px-2 py-0.5 text-[10.5px] font-semibold text-warn">{m}</span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-muted">
            TSC requires registered teachers — the TSC no is a licence-protection field.
          </p>
        </div>
      </div>
    </Card>
  );
}

function MeterRow({ label, done, total, ok }: { label: string; done: number; total: number; ok: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="numeral text-[12.5px] text-muted">{done}/{total}</span>
      </div>
      <div className="mt-1.5">
        <Meter value={total > 0 ? Math.round((done / total) * 100) : 100} ok={ok} />
      </div>
    </div>
  );
}

/**
 * CSV shaped for the KEMIS portal conversation: admission no, UPI, name,
 * birth cert ENTRY number, gender, DOB, class. Download client-side —
 * the data already passed RLS; no extra endpoint, no server write.
 */
function KemisCsvButton({ rows }: { rows: KemisReadinessData["missing_learners"] }) {
  const [done, setDone] = useState(false);
  const csv = useMemo(() => {
    const esc = (v: string | null) => (v ?? "").replaceAll("\"", "\"\"");
    const head = "Admission No,UPI,First Name,Last Name,Gender,Date of Birth,Birth Cert Entry No,Class";
    const lines = rows.map((r) => {
      const [first = "", ...rest] = r.name.split(" ");
      const last = rest.join(" ");
      return [r.admission_no, r.upi ?? "", esc(first), esc(last), r.gender ?? "", r.date_of_birth?.slice(0, 10) ?? "", r.birth_cert_no ?? "", r.class ?? ""].join(",");
    });
    return [head, ...lines].join("\r\n");
  }, [rows]);

  function download() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kemis-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex min-h-[36px] items-center rounded-sm border-2 border-primary px-3.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
    >
      {done ? "Downloaded — done" : "Export CSV"}
    </button>
  );
}

/**
 * Fix it here — the whole point of the fix-list. Type the UPI / birth-cert
 * entry no straight from the KEMIS slip; the write is the audited learner
 * upsert, leaders only at the API.
 */
function FixLearnerButton({ learner }: { learner: KemisReadinessData["missing_learners"][number] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [upi, setUpi] = useState(learner.upi ?? "");
  const [birthCertNo, setBirthCertNo] = useState(learner.birth_cert_no ?? "");

  const needsName = learner.missing.some((m) => /name/i.test(m));
  const [first = "", ...rest] = learner.name.split(" ");
  const [firstName, setFirstName] = useState(needsName ? first : "");
  const [lastName, setLastName] = useState(needsName ? rest.join(" ") : "");

  const save = () => {
    setErr(null);
    if (!upi.trim() && !birthCertNo.trim() && !needsName) return setErr("Nothing to save — type the UPI or the birth-cert entry number.");
    start(async () => {
      const r = await upsertLearnerAction({
        id: learner.id,
        firstName: firstName.trim() || first,
        lastName: lastName.trim() || rest.join(" ") || first,
        upi: upi.trim() || null,
        birthCertNo: birthCertNo.trim() || null,
      });
      if (!r.ok) { setErr(r.error ?? "Could not save."); return; }
      setMsg("Saved — the meters above update on refresh.");
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Button size="sm2" variant="ghost" onClick={() => setOpen(true)}>Fix</Button>
        {msg ? <span role="status" className="text-[10px] font-semibold text-ok">{msg}</span> : null}
      </span>
    );
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Fix exam data for ${learner.name}`}>
      <div className="w-full max-w-[460px] rounded bg-surface p-s6 shadow-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="microlabel">Fix exam data</p>
            <p className="font-display text-xl font-bold text-ink-950">{learner.name}</p>
            <p className="font-mono text-[11.5px] text-ink-500">{learner.admission_no} · missing: {learner.missing.join(", ")}</p>
          </div>
          <Button variant="ghost" size="sm2" onClick={() => setOpen(false)}>Close</Button>
        </div>
        <form className="mt-s4 grid gap-s3" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          {needsName ? (
            <>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="fx-first">First name *</label>
                <input id="fx-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="fx-last">Last name *</label>
                <input id="fx-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px]" />
              </div>
            </>
          ) : null}
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="fx-upi">UPI <span className="font-normal text-ink-500">— from the KEMIS slip; no UPI, no national exam entry</span></label>
            <input id="fx-upi" value={upi} onChange={(e) => setUpi(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-ink-700" htmlFor="fx-bc">Birth certificate entry no <span className="font-normal text-ink-500">(entry number, not serial)</span></label>
            <input id="fx-bc" value={birthCertNo} onChange={(e) => setBirthCertNo(e.target.value)} className="h-11 w-full rounded-sm border border-paper-300 bg-surface px-3 font-mono text-[13px]" />
          </div>
          {err ? <p className="text-[12.5px] font-semibold text-danger">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
