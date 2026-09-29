"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { useState, useTransition } from "react";
import { Button, Wizard } from "@mandela/ui";
import type { LearnerRow, PaymentDetails } from "@/lib/api";

const METHODS = ["mpesa", "cash", "bank", "cheque"] as const;
const INITIAL_LEARNER_LIMIT = 5;

export function paymentLearnerChoices<T extends { name: string; class: string | null; admission_no: string }>(
  learners: readonly T[],
  query: string,
  classFilter: string,
): T[] {
  const needle = query.trim().toLowerCase();
  const filtered = learners.filter((learner) =>
    (!classFilter || learner.class === classFilter) &&
    (!needle || `${learner.name} ${learner.admission_no}`.toLowerCase().includes(needle)),
  );
  return filtered.slice(0, INITIAL_LEARNER_LIMIT);
}

/** The full roster owns high-volume learner management; the cashier stays compact. */
export function paymentLearnerWorkspaceHref() { return "/app/people/learners"; }

/**
 * PayForm — docs/SIMPLICITY.md made real: a 3-step wizard with a
 * check-answers screen. Who → How much → How paid → Check → Receipt.
 * The user never wonders what happens next; the receipt number is the proof.
 */
export function PayForm({
  learners,
  action,
}: {
  learners: LearnerRow[];
  action: (input: {
    learnerId: string; amountCents: number; method: string; reference?: string;
    details?: PaymentDetails; paidAt?: string;
  }) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
}) {
  const [method, setMethod] = useState<string>("mpesa");
  const [reference, setReference] = useState("");
  // Method-specific details — what the method demands, captured here so the
  // receipt and ledger can answer "show me the proof" for every shilling.
  const [mpesaCode, setMpesaCode] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaTime, setMpesaTime] = useState("");
  const [slipNo, setSlipNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [learnerId, setLearnerId] = useState(learners[0]?.id ?? "");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  const details = (): PaymentDetails | undefined => {
    if (method === "mpesa") return { mpesa_code: mpesaCode, mpesa_phone: mpesaPhone, mpesa_time: mpesaTime };
    if (method === "bank") return { slip_no: slipNo, bank_name: bankName };
    if (method === "cheque") return { cheque_no: chequeNo, cheque_date: chequeDate, bank_name: bankName };
    return undefined;
  };

  const learner = learners.find((l) => l.id === learnerId);
  const classNames = [...new Set(learners.map((l) => l.class).filter((value): value is string => Boolean(value)))].sort();
  const learnerChoices = paymentLearnerChoices(learners, learnerQuery, classFilter);
  const filteredLearnerCount = learners.filter((candidate) =>
    (!classFilter || candidate.class === classFilter) &&
    (!learnerQuery.trim() || `${candidate.name} ${candidate.admission_no}`.toLowerCase().includes(learnerQuery.trim().toLowerCase())),
  ).length;
  const amountNum = Number((amount || "").replace(/,/g, ""));
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 10_000_000;
  const sh = (c: number) => `Ksh ${c.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  return (
    <Wizard
      key={resetKey}
      steps={[
        {
          title: "Who",
          hint: "Pick the learner this payment is for.",
          content: (
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-[12px] font-semibold text-ink-700">
                  Search learner
                  <input
                    value={learnerQuery}
                    onChange={(event) => setLearnerQuery(event.target.value)}
                    type="search"
                    placeholder="Name or admission number"
                    className="h-10 rounded-sm border border-border bg-surface px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="grid gap-1 text-[12px] font-semibold text-ink-700">
                  Class
                  <select
                    value={classFilter}
                    onChange={(event) => setClassFilter(event.target.value)}
                    className="h-10 rounded-sm border border-border bg-surface px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">All classes</option>
                    {classNames.map((className) => <option key={className} value={className}>{className}</option>)}
                  </select>
                </label>
              </div>
              {learnerChoices.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={learnerId === l.id}
                  onClick={() => setLearnerId(l.id)}
                  className={`flex h-14 items-center justify-between rounded-sm border px-4 text-left text-sm font-semibold ${
                    learnerId === l.id ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-paper-100"
                  }`}
                >
                  <span>
                    {l.name} <span className="font-normal text-muted">· {l.class ?? l.admission_no}</span>
                  </span>
                  {learnerId === l.id ? <Check aria-hidden size={16} className="shrink-0 text-primary" /> : null}
                </button>
              ))}
              {filteredLearnerCount === 0 ? <p className="py-2 text-sm text-muted">No learners match these filters.</p> : null}
              {filteredLearnerCount > INITIAL_LEARNER_LIMIT ? (
                <Link
                  href={paymentLearnerWorkspaceHref()}
                  className="inline-flex h-10 items-center rounded-sm border border-border bg-surface px-3 text-sm font-semibold text-primary hover:bg-paper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {`View all ${filteredLearnerCount} learners`}
                </Link>
              ) : null}
            </div>
          ),
          validate: () => (learnerId ? null : "Pick a learner to continue"),
          answers: [{ label: "Learner", value: learner ? `${learner.name} · ${learner.class ?? learner.admission_no}` : "—" }],
        },
        {
          title: "How much",
          hint: "Shillings only — e.g. 8500. The receipt records cents automatically.",
          content: (
            <div>
              <label htmlFor="payform-amount" className="block text-[13px] font-semibold">
                Amount (Ksh)
              </label>
              <input
                id="payform-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="8500"
                className="mt-1.5 h-14 w-full rounded-sm border border-border bg-surface px-3.5 text-lg font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ),
          validate: () =>
            amountValid ? null : "Type an amount greater than zero — for example 8500",
          answers: [{ label: "Amount", value: amountValid ? sh(amountNum * 100) : "—" }],
        },
        {
          title: "How paid",
          hint: "Tap the method, then prove it — the receipt shows what you captured.",
          content: (
            <div className="grid gap-s3h">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Payment method">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={method === m}
                    className={`h-10 rounded-pill px-4 text-[13px] font-semibold capitalize ${
                      method === m ? "bg-primary text-on-primary" : "border border-border bg-surface text-text hover:bg-paper-100"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {method === "mpesa" ? (
                <div className="grid gap-2 rounded-sm border border-border bg-paper-50 p-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">M-Pesa details</p>
                  <label htmlFor="payform-mpesa-code" className="block text-[13px] font-semibold">
                    M-Pesa code <span className="font-normal text-danger">*</span>
                  </label>
                  <input
                    id="payform-mpesa-code"
                    value={mpesaCode}
                    onChange={(e) => setMpesaCode(e.target.value)}
                    autoComplete="off"
                    placeholder="QGH7KL2M9P"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor="payform-mpesa-phone" className="block text-[13px] font-semibold">
                    Phone used
                  </label>
                  <input
                    id="payform-mpesa-phone"
                    value={mpesaPhone}
                    onChange={(e) => setMpesaPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="07XX XXX XXX"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor="payform-mpesa-time" className="block text-[13px] font-semibold">
                    Time received
                  </label>
                  <input
                    id="payform-mpesa-time"
                    type="datetime-local"
                    value={mpesaTime}
                    onChange={(e) => setMpesaTime(e.target.value)}
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-[11.5px] text-muted">The payment posts at this time — the moment the SMS says the money landed.</p>
                </div>
              ) : null}

              {method === "bank" ? (
                <div className="grid gap-2 rounded-sm border border-border bg-paper-50 p-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Bank slip details</p>
                  <label htmlFor="payform-slip" className="block text-[13px] font-semibold">
                    Slip number <span className="font-normal text-danger">*</span>
                  </label>
                  <input
                    id="payform-slip"
                    value={slipNo}
                    onChange={(e) => setSlipNo(e.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor="payform-bank" className="block text-[13px] font-semibold">
                    Bank
                  </label>
                  <input
                    id="payform-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    autoComplete="off"
                    placeholder="Equity · KCB · Co-op"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : null}

              {method === "cheque" ? (
                <div className="grid gap-2 rounded-sm border border-border bg-paper-50 p-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Cheque details</p>
                  <label htmlFor="payform-cheque" className="block text-[13px] font-semibold">
                    Cheque number <span className="font-normal text-danger">*</span>
                  </label>
                  <input
                    id="payform-cheque"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor="payform-cheque-date" className="block text-[13px] font-semibold">
                    Cheque date
                  </label>
                  <input
                    id="payform-cheque-date"
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <label htmlFor="payform-cheque-bank" className="block text-[13px] font-semibold">
                    Bank
                  </label>
                  <input
                    id="payform-cheque-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    autoComplete="off"
                    className="h-11 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : null}

              <label htmlFor="payform-reference" className="block text-[13px] font-semibold">
                Reference <span className="font-normal text-muted">(optional note for the ledger)</span>
              </label>
              <input
                id="payform-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                autoComplete="off"
                className="mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ),
          validate: () => {
            if (method === "mpesa" && !mpesaCode.trim()) return "Enter the M-Pesa code from the confirmation SMS";
            if (method === "bank" && !slipNo.trim()) return "Enter the bank slip number";
            if (method === "cheque" && !chequeNo.trim()) return "Enter the cheque number";
            return null;
          },
          answers: [
            { label: "Method", value: method },
            ...(method === "mpesa"
              ? [
                  { label: "M-Pesa code", value: mpesaCode || "—" },
                  { label: "Phone used", value: mpesaPhone || "—" },
                  { label: "Time received", value: mpesaTime || "—" },
                ]
              : []),
            ...(method === "bank"
              ? [
                  { label: "Slip number", value: slipNo || "—" },
                  { label: "Bank", value: bankName || "—" },
                ]
              : []),
            ...(method === "cheque"
              ? [
                  { label: "Cheque number", value: chequeNo || "—" },
                  { label: "Cheque date", value: chequeDate || "—" },
                  { label: "Bank", value: bankName || "—" },
                ]
              : []),
            { label: "Reference", value: reference || "—" },
          ],
        },
      ]}
      onConfirm={() =>
        new Promise((resolve) => {
          start(async () => {
            const res = await action({
              learnerId,
              amountCents: Math.round(amountNum * 100),
              method,
              reference: reference || undefined,
              details: details(),
              paidAt: method === "mpesa" && mpesaTime ? new Date(mpesaTime).toISOString() : undefined,
            });
            if (res.ok) {
              const receipt = (res.data as { receipt_no?: string } | undefined)?.receipt_no;
              resolve(receipt ?? "Receipt issued");
              setAmount("");
              setReference("");
              setMpesaCode("");
              setMpesaPhone("");
              setMpesaTime("");
              setSlipNo("");
              setBankName("");
              setChequeNo("");
              setChequeDate("");
            } else {
              resolve(null);
            }
          });
        })
      }
      doneTitle="Payment recorded"
      doneHint="The receipt is in the ledger and the audit log. Show this number if anyone asks."
      renderDoneActions={() => (
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            setResetKey((k) => k + 1);
          }}
        >
          Record another payment
        </Button>
      )}
    />
  );
}
