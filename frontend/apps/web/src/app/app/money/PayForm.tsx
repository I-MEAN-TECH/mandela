"use client";

import { Check } from "lucide-react";

import { useState, useTransition } from "react";
import { Button, Wizard } from "@mandela/ui";
import type { LearnerRow } from "@/lib/api";

const METHODS = ["mpesa", "cash", "bank", "cheque"] as const;

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
  action: (input: { learnerId: string; amountCents: number; method: string; reference?: string }) => Promise<{
    ok: boolean;
    error?: string;
    data?: unknown;
  }>;
}) {
  const [method, setMethod] = useState<string>("mpesa");
  const [reference, setReference] = useState("");
  const [learnerId, setLearnerId] = useState(learners[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  const learner = learners.find((l) => l.id === learnerId);
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
              {learners.map((l) => (
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
          hint: "Tap the method the money arrived by.",
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
              <label htmlFor="payform-reference" className="block text-[13px] font-semibold">
                Reference <span className="font-normal text-muted">(optional — bank slip or cheque number)</span>
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
          answers: [
            { label: "Method", value: method },
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
            });
            if (res.ok) {
              const receipt = (res.data as { receipt_no?: string } | undefined)?.receipt_no;
              resolve(receipt ?? "Receipt issued");
              setAmount("");
              setReference("");
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
