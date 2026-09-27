import Link from "next/link";
import { ArrowRight, Coins, TrendingDown, Users, CircleCheckBig, MessageSquare, Plus, Send, ShieldCheck, CalendarDays } from "lucide-react";
import {
  Card, CardHead, KpiCard, Delta, StatusPill, EmptyState, Meter, Reveal, CountUpMoney, CountUp,
  CashflowChart, StatisticDonut, DonutLegend, compactKes,
} from "@mandela/ui";
import type { AdminPulseData } from "@/lib/api";

/**
 * Admin Today — the reference dashboard composition, fed by real data:
 *  · deep-pine hero card (the term: balance, days left, audit heartbeat)
 *  · four quick-action tiles (the Admin's daily verbs)
 *  · three KPI cards with icon wells + delta chips
 *  · Cashflow chart — collected vs billed, last 6 months
 *  · Statistic donut — money by payment method
 *  · Recent Transactions table + Recent Activity (audit timeline)
 *  · Daily-limit-style term meter + per-class progress list
 */

const ICON = {
  coin: <Coins size={20} strokeWidth={1.75} aria-hidden />,
  down: <TrendingDown size={20} strokeWidth={1.75} aria-hidden />,
  people: <Users size={20} strokeWidth={1.75} aria-hidden />,
  check: <CircleCheckBig size={20} strokeWidth={1.75} aria-hidden />,
  chat: <MessageSquare size={20} strokeWidth={1.75} aria-hidden />,
  plus: <Plus size={20} strokeWidth={1.75} aria-hidden />,
  send: <Send size={20} strokeWidth={1.75} aria-hidden />,
  shield: <ShieldCheck size={20} strokeWidth={1.75} aria-hidden />,
  calendar: <CalendarDays size={20} strokeWidth={1.75} aria-hidden />,
} as const;

function methodLabel(m: string): string {
  if (m === "mpesa") return "M-Pesa";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function AdminPulse({
  pulse,
  collections,
}: {
  pulse: AdminPulseData | { error: string };
  collections: { class: string; billed_cents: string; paid_cents: string }[];
}) {
  if ("error" in pulse) {
    return <EmptyState title="Could not load the pulse" body="The school database did not respond. Try again shortly." />;
  }

  const collected = Number(pulse.money.collected_term_cents);
  const billed = Number(pulse.money.billed_term_cents);
  const rate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  const outstanding = Math.max(billed - collected, 0);
  const attRate = pulse.attendance_today.expected > 0
    ? Math.round((pulse.attendance_today.present / pulse.attendance_today.expected) * 100)
    : 0;
  const waRate = pulse.guardians.total > 0
    ? Math.round((pulse.guardians.whatsapp / pulse.guardians.total) * 100)
    : 0;
  const term = pulse.term;
  const donutTotal = pulse.by_method.reduce((s, m) => s + Number(m.total_cents), 0);

  return (
    <div className="grid gap-s3h">
      {/* ROW 1 — four stat cards, even 4-across (the comp's top row). */}
      <Reveal>
        <div className="grid grid-cols-2 gap-s3h xl:grid-cols-4">
          <KpiCard
            icon={ICON.coin }
            delta={{ text: `${rate}% of billed`, tone: rate >= 90 ? "ok" : rate >= 50 ? "warn" : "danger" }}
            value={<CountUpMoney cents={collected} />}
            label="Collected this term"
            note={`of ${fmtKes(billed)} billed`}
          />
          <KpiCard
            icon={ICON.people }
            delta={{ text: `${pulse.learners_active} on roll`, tone: "neutral" }}
            value={<CountUp value={pulse.staff_active} />}
            label="Staff on register"
            note={`${pulse.staff_total} on the books`}
          />
          <KpiCard
            icon={ICON.check }
            delta={{ text: attRate === 0 ? "not yet marked" : `${attRate}% today`, tone: attRate >= 90 ? "ok" : attRate === 0 ? "neutral" : "warn" }}
            value={<><CountUp value={attRate} /><span className="text-xl font-medium text-ink-500">%</span></>}
            label="Attendance today"
            note={`${pulse.attendance_today.present} present of ${pulse.attendance_today.expected}`}
          />
          <KpiCard
            icon={ICON.chat }
            delta={{ text: `${pulse.guardians.whatsapp} of ${pulse.guardians.total}`, tone: "neutral" }}
            value={<><CountUp value={waRate} /><span className="text-xl font-medium text-ink-500">%</span></>}
            label="Parents on WhatsApp"
          />
        </div>
      </Reveal>

      {/* ROW 2 — hero + quick tiles | Cashflow (the comp's left rail + chart) */}
      <Reveal delay={60}>
        <div className="grid gap-s3h xl:grid-cols-[minmax(0,300px)_1fr]">
          <div className="grid content-start gap-s3h">
            {/* The hero — the term as the balance card */}
            <section className="relative overflow-hidden rounded bg-brand-deep p-s5 text-brand-deep-contrast shadow-1">
              <svg aria-hidden viewBox="0 0 24 24" className="absolute -right-4 -top-4 h-24 w-24 text-white/[0.06]" fill="currentColor">
                <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z" />
              </svg>
              <p className="microlabel !text-white/50">This term{term ? ` · ${term.label}` : ""}</p>
              <p className="display mt-2 text-[22px] text-brand-deep-contrast">
                {term ? (
                  <>Ends <em className="text-lime-300">{formatDate(term.ends_on)}</em></>
                ) : (
                  <>No term <em className="text-lime-300">running</em></>
                )}
              </p>
              <div className="mt-6 flex items-end justify-between gap-3">
                <span>
                  <span className="block text-[11.5px] text-white/60">Still to collect</span>
                  <span className="numeral mt-1 block text-[26px] font-semibold leading-none text-brand-deep-contrast">
                    <CountUpMoney cents={outstanding} />
                  </span>
                </span>
                {term ? (
                  <span className="text-right">
                    <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50">Days left</span>
                    <span className="numeral mt-1 block text-[22px] font-semibold leading-none text-lime-300">{term.days_left}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <Delta tone={pulse.audit_term === 0 ? "warn" : "ok"}>
                  {pulse.audit_term === 0
                    ? "no entries this term — money is moving unrecorded"
                    : `${pulse.audit_term} audit entries this term — the record is alive`}
                </Delta>
              </div>
            </section>

            {/* Needs you today — the 36/37 governance vitals (two-leaders hinge) */}
            <Link
              href="/app/inbox"
              className="group block rounded border border-border bg-surface p-s4 shadow-1 transition-colors hover:bg-paper-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-950">Needs you today</span>
                <span className="text-[11.5px] font-semibold text-pine-700 underline decoration-pine-300 underline-offset-4 group-hover:decoration-pine-700">
                  Inbox
                    <ArrowRight aria-hidden size={14} strokeWidth={2} />
                </span>
              </div>
              <div className="mt-s3 grid grid-cols-2 gap-s3">
                <div>
                  <p className="numeral text-[26px] font-semibold leading-none text-ink-950">
                    <CountUp value={pulse.approvals.pending} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {pulse.approvals.pending === 1 ? "request waiting" : "requests waiting"}
                    {pulse.approvals.oldest_days !== null && pulse.approvals.oldest_days > 0
                      ? ` · oldest ${pulse.approvals.oldest_days}d`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className={`numeral text-[26px] font-semibold leading-none ${pulse.tasks.overdue > 0 ? "text-danger" : "text-ink-950"}`}>
                    <CountUp value={pulse.tasks.overdue} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {pulse.tasks.overdue === 1 ? "task overdue" : "tasks overdue"} · {pulse.tasks.open} open
                  </p>
                </div>
              </div>
            </Link>

            {/* 38 — the Sections vital sign: the school beyond the classroom */}
            <Link
              href="/app/operations/sections"
              className="group block rounded border border-border bg-surface p-s4 shadow-1 transition-colors hover:bg-paper-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-950">Sections this week</span>
                <span className="text-[11.5px] font-semibold text-pine-700 underline decoration-pine-300 underline-offset-4 group-hover:decoration-pine-700">
                  Operations
                    <ArrowRight aria-hidden size={14} strokeWidth={2} />
                </span>
              </div>
              <div className="mt-s3 grid grid-cols-3 gap-s3">
                <div>
                  <p className="numeral text-[26px] font-semibold leading-none text-ink-950">
                    <CountUp value={pulse.sections.events_week} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">events in 7 days</p>
                </div>
                <div>
                  <p className={`numeral text-[26px] font-semibold leading-none ${pulse.sections.kit_low > 0 ? "text-warn" : "text-ink-950"}`}>
                    <CountUp value={pulse.sections.kit_low} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">kit running low</p>
                </div>
                <div>
                  <p className="numeral text-[26px] font-semibold leading-none text-ink-950">
                    <CountUp value={pulse.sections.sections_enabled} />
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">sections enabled</p>
                </div>
              </div>
            </Link>

            {/* Quick actions — the four tiles */}
            <div className="grid grid-cols-4 overflow-hidden rounded border border-border bg-paper-50 shadow-1 max-[420px]:grid-cols-2">
              <Tile href="/app/inbox" icon={ICON.check} label="Inbox" first />
              <Tile href="/app/money" icon={ICON.coin} label="Collect" />
              <Tile href="/app/broadcast" icon={ICON.send} label="Broadcast" />
              <Tile href="/app/settings" icon={ICON.shield} label="Audit" last />
            </div>
          </div>

          <Card>
            <CardHead
              title="Cashflow"
              sub="Collected vs billed — the last six months"
              action={<TermPill label={term?.label ?? "All time"} />}
            />
            <CashflowChart
              upLabel="Collected"
              downLabel="Billed"
              months={pulse.cashflow.map((m) => ({
                label: m.month,
                up: Number(m.collected_cents),
                down: Number(m.billed_cents),
              }))}
            />
          </Card>
        </div>
      </Reveal>

      {/* ROW 3 — Statistic donut | Recent transactions */}
      <Reveal delay={120} className="min-w-0">
        <div className="grid gap-s3h xl:grid-cols-[340px_1fr]">
          <Card>
            <CardHead title="Statistic" sub="Collected money by channel" action={<TermPill label="This term" />} />
            {donutTotal === 0 ? (
              <EmptyState title="No confirmed money yet" body="The donut fills as payments are confirmed." />
            ) : (
              <>
                <StatisticDonut
                  slices={pulse.by_method.map((m) => ({ label: methodLabel(m.method), value: Number(m.total_cents) }))}
                  centerLabel="Collected"
                  centerValue={fmtKes(donutTotal)}
                />
                <div className="mt-s4">
                  <DonutLegend
                    slices={pulse.by_method.map((m) => ({ label: methodLabel(m.method), value: Number(m.total_cents) }))}
                    total={donutTotal}
                  />
                </div>
              </>
            )}
          </Card>

          <Card className="min-w-0">
            <CardHead
              title="Recent transactions"
              sub="Confirmed receipts, newest first"
              action={
                <Link href="/app/money" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
                  Full ledger
                    <ArrowRight aria-hidden size={14} strokeWidth={2} />
                </Link>
              }
            />
            {pulse.recent_payments.length === 0 ? (
              <EmptyState title="No payments yet" body="Confirmed payments appear here instantly." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-paper-200">
                      <th className="microlabel !mb-0 py-2 pr-3">Learner</th>
                      <th className="microlabel !mb-0 py-2 pr-3">Receipt</th>
                      <th className="microlabel !mb-0 py-2 pr-3">Date</th>
                      <th className="microlabel !mb-0 py-2 pr-3 text-right">Amount</th>
                      <th className="microlabel !mb-0 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pulse.recent_payments.map((p) => (
                      <tr key={p.receipt_no} className="border-b border-paper-200 last:border-b-0">
                        <td className="py-s3 pr-3">
                          <span className="block truncate font-semibold text-ink-950">{p.learner}</span>
                          <span className="block text-[11.5px] text-muted">{methodLabel(p.method)}</span>
                        </td>
                        <td className="py-s3 pr-3 font-mono text-[11.5px] text-muted">{p.receipt_no}</td>
                        <td className="py-s3 pr-3 text-[12px] text-muted">{formatDate(p.paid_at)}</td>
                        <td className="numeral py-s3 pr-3 text-right font-semibold"><CountUpMoney cents={Number(p.amount_cents)} /></td>
                        <td className="py-s3 text-right">
                          <StatusPill tone="ok">Confirmed</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Reveal>

      {/* ROW 4 — Recent activity | Collections by class */}
      <Reveal delay={180} className="min-w-0">
        <div className="grid gap-s3h xl:grid-cols-[340px_1fr]">
          <Card>
            <CardHead title="Recent activity" sub="From the audit trail" action={<Link href="/app/settings" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">All<ArrowRight aria-hidden size={14} strokeWidth={2} className="inline align-[-2px]" /></Link>} />
            {pulse.recent_audit.length === 0 ? (
              <EmptyState title="No entries yet" body="Every record, confirm and change lands here." />
            ) : (
              <ol className="relative ml-1.5 border-l border-paper-200 pl-4">
                {pulse.recent_audit.map((a, i) => (
                  <li key={i} className="relative pb-s4 last:pb-0">
                    <span aria-hidden className="absolute -left-[21.5px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-paper-200 bg-surface">
                      <span className="h-1.5 w-1.5 rounded-full bg-pine-700" />
                    </span>
                    <p className="text-[12.5px] leading-snug">
                      <span className="font-mono font-semibold text-ink-950">{a.action}</span>{" "}
                      <span className="text-muted">· {a.entity} · by {a.actor_kind}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted">{formatDateTime(a.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHead
              title="Collections by class"
              sub="Progress against each class's billing"
              action={
                <Link href="/app/money" className="inline-flex h-11 items-center text-[12.5px] font-semibold underline decoration-paper-300 underline-offset-4 hover:decoration-primary">
                  Money
                    <ArrowRight aria-hidden size={14} strokeWidth={2} />
                </Link>
              }
            />
            <ClassMeters rows={collections} />
          </Card>
        </div>
      </Reveal>
    </div>
  );
}

function fmtKes(cents: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Collections-by-class is fetched server-side by the page and passed down. */
function ClassMeters({ rows }: { rows?: { class: string; billed_cents: string; paid_cents: string }[] }) {
  if (!rows || rows.length === 0) {
    return <EmptyState title="No fee items yet" body="Collections appear once fee items are billed." />;
  }
  return (
    <div className="grid gap-s3">
      {rows.slice(0, 4).map((c) => {
        const billed = Number(c.billed_cents);
        const paid = Number(c.paid_cents);
        const pct = billed > 0 ? Math.round((paid / billed) * 100) : 0;
        return (
          <div key={c.class}>
            <div className="flex items-baseline justify-between gap-s3">
              <p className="truncate text-[13.5px] font-semibold text-ink-950">{c.class}</p>
              <p className="numeral shrink-0 text-[12px] text-muted tabular-nums">
                {fmtKes(paid)} <span className="text-ink-400">of {fmtKes(billed)}</span>
              </p>
            </div>
            <div className="mt-1.5">
              <Meter value={pct} ok={pct >= 90} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tile({ href, icon, label, first, last }: { href: string; icon: React.ReactNode; label: string; first?: boolean; last?: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[84px] flex-col items-center justify-center gap-1.5 bg-paper-50 px-2 py-3 text-center transition-colors hover:bg-paper-100 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pine-500 ${
        first ? "" : "border-l border-paper-200"
      } ${last ? "" : ""} max-[420px]:[&:nth-child(3)]:border-l-0 max-[420px]:[&:nth-child(n+3)]:border-t max-[420px]:[&:nth-child(3)]:border-l`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-sm border border-paper-200 bg-surface text-pine-700 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-0.5 motion-reduce:transition-none">
        {icon}
      </span>
      <span className="text-[11.5px] font-semibold text-ink-900">{label}</span>
    </Link>
  );
}

function TermPill({ label }: { label: string }) {
  // A real chip naming the active term — no decorative chevron pretending
  // to be a selector (the reference's dropdown look, honest version).
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-paper-100 px-3 text-[12px] font-semibold text-ink-700">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lime-500" />
      {label}
    </span>
  );
}
