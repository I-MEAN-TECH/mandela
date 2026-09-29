"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHead, KpiCard, Meter, Money, StatusPill, EmptyState, SparklineStrip, WeekdayHeatmap, FunnelBars, RouteStrip, StandingsBars, type HeatMark } from "@mandela/ui";
import type { TeacherPulseData, BursarPulseData, PrincipalPulseData, CounterPulseData, DriverPulseData, DormParentPulseData, JanitorPulseData, LibrarianPulseData, PatronPulseData, HodPulseData } from "@/lib/api";

/**
 * RolePulses — Phase 5 (PLATFORM-PLAN §6.2–6.6) + Phase 6 (§6.7–6.11): one
 * "Today" per role. Each answers the role's prime question first, keeps ONE
 * primary action in reach (the 2-tap rule), and renders its §8 chart. Teacher
 * is the activation role: when nothing is marked today, Today IS the mark
 * screen (§6.3). HOD (§6.11) renders the teacher base + department overlay.
 */

const kes = (cents: string | number) => `Ksh ${Number(cents).toLocaleString("en-KE")}`;

/** The teacher dashboard is a classroom workbench, not a leadership shortcut. */
export const TEACHER_TOOLS = [
  { href: "/app/mark", label: "Mark attendance", hint: "Today's roll" },
  { href: "/app/homework", label: "Set homework", hint: "Due this week" },
  { href: "/app/class", label: "My class", hint: "Roster + marks" },
  { href: "/app/messages", label: "Messages", hint: "Parents & staff" },
] as const;

/**
 * StaffNotice — leadership broadcasts for staff (System completion B1). Shows
 * on every role's Today until this device dismisses it (localStorage). purely
 * presentational: a pinned card, not a route.
 */
export function StaffNotice({ n, storageKey }: { n: { title: string; body: string; created_at: string } | null | undefined; storageKey: string }) {
  if (!n) return null;
  return (
    <NoticeCard n={n} storageKey={storageKey} />
  );
}

function NoticeCard({ n, storageKey }: { n: { title: string; body: string; created_at: string }; storageKey: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem(storageKey) === n.created_at);
  }, [storageKey, n.created_at]);
  if (hidden) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <div className="flex items-start justify-between gap-s2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-info">Notice from leadership</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold">{n.title}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss notice"
          onClick={() => {
            localStorage.setItem(storageKey, n.created_at);
            setHidden(true);
          }}
          className="h-8 w-8 shrink-0 rounded-full border border-border text-muted hover:text-text"
        >
          ×
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{n.body}</p>
      <p className="mt-1 font-mono text-[11.5px] text-muted">
        {new Date(n.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </Card>
  );
}

/* ============================ TEACHER — §6.3 ============================ */

export function TeacherToday({ p }: { p: TeacherPulseData }) {
  // First-run (no marks yet today) reaches this too — beneath the mark
  // roster — where present/expected reads "0/0 · not marked" honestly.
  const pct = p.expected > 0 ? Math.round((p.present / p.expected) * 100) : null;
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_teacher" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Present today" value={`${p.present}/${p.expected}`} note={pct !== null ? `${pct}% of my class` : "not marked"} />
        <KpiCard label="Homework due (7d)" value={String(p.homework_due_week)} />
        <KpiCard label="Unmarked assessments" value={String(p.unmarked_assessments)} />
        <KpiCard label="Messages today" value={String(p.messages_today)} />
      </div>

      <Card>
        <CardHead title="Today's timetable" sub="My slots, in order" />
        {p.slots_today.length === 0 ? (
          <EmptyState title="No slots today" body="Enjoy the quiet — or set the timetable." />
        ) : (
          <ol className="grid gap-s2" style={{ fontVariantNumeric: "tabular-nums" }}>
            {p.slots_today.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="text-[13px] font-semibold text-ink-950">{s.area_name ?? `Period ${s.period}`}</span>
                <span className="text-[12px] text-muted">{s.starts_at ?? `P${s.period}`}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-s3 flex flex-wrap gap-s3 border-t border-border pt-s3">
          <Link href="/app/mark" className="text-[12.5px] font-semibold underline underline-offset-4">Mark attendance</Link>
          <Link href="/app/homework" className="text-[12.5px] font-semibold underline underline-offset-4">Set homework</Link>
        </div>
      </Card>

      {p.heatmap.length > 0 ? (
        <Card>
          <CardHead title="My class — last 10 marked days" sub="Green = here · L = late · ✕ = absent · blank = no record" />
          <WeekdayHeatmap rows={p.heatmap.map((h) => ({ name: h.name, marks: h.marks as HeatMark[] }))} />
        </Card>
      ) : null}

      {/* The teacher's other accesses, one tap away — report-card desk included. */}
      <Card>
        <CardHead title="Your tools" sub="Classroom work, one tap away" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEACHER_TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-sm border border-border bg-paper-50 px-s3 py-s2.5 transition-colors hover:border-primary hover:bg-surface"
            >
              <span className="block text-[13px] font-semibold text-ink-950 group-hover:text-primary">{t.label}</span>
              <span className="block text-[11.5px] text-muted">{t.hint}</span>
            </Link>
          ))}
        </div>
      </Card>

      {p.duty_today.length > 0 ? (
        <Card>
          <CardHead title="My duty today" />
          <ul className="grid gap-1.5">
            {p.duty_today.map((d, i) => <li key={i} className="text-[13px] text-ink-900">· {d}</li>)}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================ BURSAR — §6.4 ============================ */

export function BursarToday({ p }: { p: BursarPulseData }) {
  const pct = Number(p.billed_term_cents) > 0 ? Math.round((Number(p.collected_term_cents) / Number(p.billed_term_cents)) * 100) : 0;
  const maxWeek = Math.max(1, ...p.week.map((w) => Number(w.collected_cents)));
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_bursar" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Collected today" value={kes(p.collected_today_cents)} />
        <KpiCard label="This term" value={kes(p.collected_term_cents)} note={`${pct}% of ${kes(p.billed_term_cents)}`} />
        <KpiCard label="Pending confirmations" value={String(p.pending_confirmations)} note={p.pending_confirmations > 0 ? "needs eyes" : "clear"} />
        <KpiCard label="Top arrears" value={p.top_arrears_class ? p.top_arrears_class.class : "—"} note={p.top_arrears_class ? kes(p.top_arrears_class.arrears_cents) : undefined} />
      </div>

      <Card>
        <CardHead title="Collections, last 7 days" sub="Confirmed receipts per day" />
        <SparklineStrip points={p.week.map((w) => ({ label: w.day, value: Number(w.collected_cents) }))} />
      </Card>

      <Card>
        <CardHead title="Pending confirmations" sub="Oldest first — the queue to clear" />
        {p.confirmations.length === 0 ? (
          <EmptyState title="Nothing waiting" body="Every payment is confirmed." />
        ) : (
          <ul className="grid gap-s2">
            {p.confirmations.map((c) => (
              <li key={c.receipt_no} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{c.learner}</span>
                  <span className="block text-[11.5px] text-muted">{c.receipt_no} · {c.method}</span>
                </span>
                <span className="text-[13px] font-semibold text-ink-950">{kes(c.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/reconcile" className="text-[12.5px] font-semibold underline underline-offset-4">Open Reconcile</Link>
        </div>
      </Card>

      {p.rails_suggestions.length > 0 ? (
        <Card>
          <CardHead title="Rails suggestions to match" sub="Daraja / bank CSV rows waiting for a decision" />
          <ul className="grid gap-s2">
            {p.rails_suggestions.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="truncate text-[13px] text-ink-900">{r.payer_name ?? "Unknown payer"}</span>
                <span className="text-[12.5px] font-semibold">{kes(r.amount_cents)} · {r.source}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHead title="Largest arrears" sub="The five families to call" />
        <ul className="grid gap-s2" style={{ fontVariantNumeric: "tabular-nums" }}>
          {p.arrears.map((a, i) => (
            <li key={i} className="flex items-center justify-between text-[13px]">
              <span className="min-w-0 truncate font-medium text-ink-950">{a.learner} <span className="text-muted">· {a.class}</span></span>
              <span className="font-semibold text-danger">{kes(a.balance_cents)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ============================ PRINCIPAL — §6.2 ============================ */

export function PrincipalToday({ p }: { p: PrincipalPulseData }) {
  return (
    <div className="grid gap-s5">
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Attendance today" value={p.attendance_pct !== null ? `${p.attendance_pct}%` : "—"} note="whole school" />
        <KpiCard label="Incidents (7d)" value={String(p.incidents_7d)} note={p.incidents_7d > 0 ? "needs eyes" : "quiet"} />
        <KpiCard label="Approvals pending" value={String(p.approvals_pending)} />
        <KpiCard label="Fee collection" value={p.collection_pct !== null ? `${p.collection_pct}%` : "—"} note="read-only" />
      </div>

      <Card>
        <CardHead title="Pending approvals" sub="Oldest first — sign or decline" />
        {p.approvals_feed.length === 0 ? (
          <EmptyState title="Nothing to sign" body="The tray is empty." />
        ) : (
          <ul className="grid gap-s2">
            {p.approvals_feed.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0 truncate text-[13px] font-medium text-ink-950">{a.request_type.replace(/-/g, " ")} <span className="text-muted">· {a.requester}</span></span>
                <StatusPill tone="warn">waiting</StatusPill>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/approve" className="text-[12.5px] font-semibold underline underline-offset-4">Review approvals</Link>
        </div>
      </Card>

      <Card>
        <CardHead title="Attendance trend — 14 days" sub="School-wide present %, per day" />
        <SparklineStrip points={p.attendance_trend.map((t) => ({ label: t.day.slice(8), value: t.pct, of: t.pct / 100 }))} />
      </Card>

      <div className="grid gap-s3h">
        <Card>
          <CardHead title="Today's absences by class" />
          {p.absences_by_class.length === 0 ? (
            <EmptyState title="Full house" body="No absences recorded today." />
          ) : (
            <ul className="grid gap-s2">
              {p.absences_by_class.map((a) => (
                <li key={a.class} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink-950">{a.class}</span>
                  <span className="font-semibold text-danger">{a.absent}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHead title="Incidents by class (7d)" />
          {p.incidents_by_class.length === 0 ? (
            <EmptyState title="Quiet week" body="No incidents filed." />
          ) : (
            <ul className="grid gap-s2">
              {p.incidents_by_class.map((a) => (
                <li key={a.class} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink-950">{a.class}</span>
                  <span className="font-semibold text-warn">{a.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHead title="Duty roster today" />
        {p.duty_today.length === 0 ? (
          <EmptyState title="No duty slots" body="Nobody is rostered today." />
        ) : (
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.duty_today.map((d, i) => <li key={i}>· <span className="font-medium">{d.staff}</span> — {d.duty}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ============================ COUNTER — §6.5 ============================ */

export function CounterToday({ p }: { p: CounterPulseData }) {
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_counter" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Visitors on site" value={String(p.visitors_on_site)} />
        <KpiCard label="Calls logged today" value={String(p.calls_today)} />
        <KpiCard label="Open inquiries" value={String(p.open_inquiries)} />
        <KpiCard label="Fee inquiries today" value={String(p.fee_inquiries_today)} />
      </div>

      <Card>
        <CardHead title="Inquiries by stage" sub="The front-desk funnel at a glance" />
        {p.funnel.length === 0 ? (
          <EmptyState title="No inquiries yet" body="Walk-ins and phone calls land here." />
        ) : (
          <FunnelBars stages={p.funnel} />
        )}
      </Card>

      <Card>
        <CardHead title="Awaiting checkout" sub="Signed in, still on site" />
        {p.awaiting_checkout.length === 0 ? (
          <EmptyState title="Nobody waiting" body="The visitor book is clear." />
        ) : (
          <ul className="grid gap-s2">
            {p.awaiting_checkout.map((v, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0 truncate text-[13px] font-semibold text-ink-950">{v.visitor} <span className="font-normal text-muted">· {v.visiting}</span></span>
                <span className="text-[11.5px] text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{v.time_in.slice(11, 16)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/operations/security" className="text-[12.5px] font-semibold underline underline-offset-4">Log a visitor</Link>
        </div>
      </Card>

      <div className="grid gap-s3h lg:grid-cols-2">
        <Card>
          <CardHead title="New inquiries" />
          {p.new_inquiries.length === 0 ? (
            <EmptyState title="None yet" body="New families appear here." />
          ) : (
            <ul className="grid gap-s2 text-[13px]">
              {p.new_inquiries.map((q, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="min-w-0 truncate font-medium text-ink-950">{q.child} <span className="font-normal text-muted">· {q.parent}</span></span>
                  <StatusPill tone="neutral">{q.stage}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHead title="Today's events" />
          {p.events_today.length === 0 ? (
            <EmptyState title="Quiet day" body="Nothing on the calendar." />
          ) : (
            <ul className="grid gap-1.5 text-[13px] text-ink-900">
              {p.events_today.map((e, i) => <li key={i}>· {e.title}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============================ DRIVER — §6.6 ============================ */

export function DriverToday({ p }: { p: DriverPulseData }) {
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_driver" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Today's trips" value={String(p.trips_today)} />
        <KpiCard label="On manifest" value={String(p.on_manifest)} />
        <KpiCard label="Not picked up" value={String(p.not_picked_up)} note={p.not_picked_up > 0 ? "run the route" : "all aboard"} />
        <KpiCard label="Bus" value={p.bus_status ?? "—"} note={p.bus_status ? "on route" : "unassigned"} />
      </div>

      <Card>
        <CardHead title="The route today" sub="Stops in order — tick off as you go" />
        {p.route_stops.length === 0 ? (
          <EmptyState title="No route yet" body="Stops appear once a route has a manifest." />
        ) : (
          <RouteStrip stops={p.route_stops} />
        )}
      </Card>

      <Card>
        <CardHead title="Manifest" sub="Who boards where" />
        {p.manifest.length === 0 ? (
          <EmptyState title="Empty manifest" body="No learners are on this route this term." />
        ) : (
          <ul className="grid gap-s2" style={{ fontVariantNumeric: "tabular-nums" }}>
            {p.manifest.slice(0, 12).map((m, i) => (
              <li key={i} className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-ink-950">{m.learner}</span>
                <span className="text-muted">{m.stop ?? "—"}</span>
                <StatusPill tone={m.ticked ? "ok" : "neutral"}>{m.ticked ? "on board" : "waiting"}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.route_affecting_events.length > 0 ? (
        <Card>
          <CardHead title="Events affecting routes" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.route_affecting_events.map((e, i) => <li key={i}>· {e.title}</li>)}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ========================= DORM PARENT — §6.7 ========================= */

export function DormParentToday({ p }: { p: DormParentPulseData }) {
  const pct = p.beds > 0 ? Math.round((p.occupied / p.beds) * 100) : 0;
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_dorm" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Beds tonight" value={`${p.occupied}/${p.beds}`} note={`${pct}% occupied`} />
        <KpiCard label="Exeats out now" value={String(p.exeats_out)} />
        <KpiCard label="Laundry in custody" value={String(p.laundry_in_custody)} />
        <KpiCard label="Incidents (7d)" value={String(p.incidents_7d)} />
      </div>

      <Card>
        <CardHead
          title="Tonight's rollcall"
          sub={p.rollcall_taken ? "Recorded — re-mark any latecomer" : "Who's in, who's out — mark it before lights-out"}
        />
        {p.rollcall.length === 0 ? (
          <EmptyState title="No allocations" body="Your dorm has no learners allocated yet — the admin allocates beds in Hostel." />
        ) : (
          <ul className="grid gap-s2">
            {p.rollcall.map((r) => (
              <li key={r.learner_id} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{r.name}</span>
                  <span className="block text-[11.5px] text-muted">Bed {r.bed_label ?? "—"}</span>
                </span>
                {r.present === null ? (
                  <StatusPill tone="neutral">not marked</StatusPill>
                ) : r.present ? (
                  <StatusPill tone="ok">in</StatusPill>
                ) : (
                  <StatusPill tone="danger">out</StatusPill>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/operations/hostel" className="text-[12.5px] font-semibold underline underline-offset-4">Take rollcall</Link>
        </div>
      </Card>

      {p.dorms.length > 0 ? (
        <Card>
          <CardHead title="Occupancy by dorm" sub="Beds filled vs capacity — ink meters, §8" />
          <div className="grid gap-s3">
            {p.dorms.map((d) => (
              <div key={d.id} className="flex items-center gap-s3">
                <span className="w-24 shrink-0 truncate text-[12.5px] font-semibold text-ink-900">{d.name}</span>
                <span className="relative h-s3 flex-1 overflow-hidden rounded-sm bg-paper-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-ink-900"
                    style={{ width: `${Math.max(3, Math.min(100, (d.occupied / Math.max(d.capacity, 1)) * 100))}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink-950">{d.occupied}/{d.capacity}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {p.pending_exeats.length > 0 ? (
        <Card>
          <CardHead title="Exeats to decide or expect back" />
          <ul className="grid gap-s2">
            {p.pending_exeats.map((e, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{e.learner}</span>
                  <span className="block text-[11.5px] text-muted">{e.reason}</span>
                </span>
                <StatusPill tone={e.state === "approved" ? "warn" : "neutral"}>{e.state}</StatusPill>
              </li>
            ))}
          </ul>
          <div className="mt-s3 border-t border-border pt-s3">
            <Link href="/app/operations/hostel" className="text-[12.5px] font-semibold underline underline-offset-4">Open Exeats</Link>
          </div>
        </Card>
      ) : null}

      {p.laundry_today.length > 0 ? (
        <Card>
          <CardHead title="Laundry moves today" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.laundry_today.map((m, i) => <li key={i}>· {m.learner} — {m.direction === "out" ? "sent out" : "returned"}: {m.items}</li>)}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================ JANITOR — §6.8 ============================ */

export function JanitorToday({ p }: { p: JanitorPulseData }) {
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_janitor" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Open repairs" value={String(p.open_repairs)} />
        <KpiCard label="Done this week" value={String(p.done_7d)} />
        <KpiCard label="Structural open" value={String(p.structural_open)} note={p.structural_open > 0 ? "needs the office" : undefined} />
        <KpiCard label="Supplies low" value={String(p.supplies_low)} />
      </div>

      <Card>
        <CardHead title="Repair queue" sub="Structural first, oldest first — report from the zone you're in" />
        {p.queue.length === 0 ? (
          <EmptyState title="Queue is clear" body="Nothing broken on the books — log wear before it breaks." />
        ) : (
          <ul className="grid gap-s2">
            {p.queue.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{r.room} — {r.item}</span>
                  <span className="block text-[11.5px] text-muted">{r.condition} · est {kes(r.est_cost_cents)}</span>
                </span>
                <StatusPill tone={r.condition === "structural" ? "danger" : r.state === "in-repair" ? "warn" : "neutral"}>{r.state}</StatusPill>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/operations/facilities" className="text-[12.5px] font-semibold underline underline-offset-4">Report a repair</Link>
        </div>
      </Card>

      {p.supplies.length > 0 ? (
        <Card>
          <CardHead title="Supplies running low" sub="At or under their floor — reorder before they run out" />
          <ul className="grid gap-s2">
            {p.supplies.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="truncate text-[13px] text-ink-900">{s.name}{s.location ? ` · ${s.location}` : ""}</span>
                <span className="text-[12.5px] font-semibold">{s.qty_on_hand} left (min {s.low_stock_threshold})</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* =========================== LIBRARIAN — §6.9 =========================== */

export function LibrarianToday({ p }: { p: LibrarianPulseData }) {
  const maxBorrow = Math.max(1, ...p.by_class_30d.map((b) => b.n));
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_librarian" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Copies out" value={String(p.copies_out)} />
        <KpiCard label="Due today" value={String(p.due_today)} />
        <KpiCard label="Overdue" value={String(p.overdue)} />
        <KpiCard label="New titles (term)" value={String(p.new_titles_term)} />
      </div>

      <Card>
        <CardHead title="Returns due & overdue" sub="Learner + title, oldest due first" />
        {p.due_feed.length === 0 ? (
          <EmptyState title="Nothing due" body="Every issued copy is still within its loan." />
        ) : (
          <ul className="grid gap-s2">
            {p.due_feed.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{r.learner}</span>
                  <span className="block text-[11.5px] text-muted">{r.title} · {r.barcode}</span>
                </span>
                <StatusPill tone={r.overdue ? "danger" : "warn"}>{r.overdue ? `overdue ${r.due_on}` : `due ${r.due_on}`}</StatusPill>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/operations/library" className="text-[12.5px] font-semibold underline underline-offset-4">Issue / Return</Link>
        </div>
      </Card>

      <Card>
        <CardHead title="Borrowing by class — last 30 days" sub="§6.9 bars, ink-only" />
        {p.by_class_30d.length === 0 ? (
          <EmptyState title="No loans yet" body="Issue a copy and the chart starts." />
        ) : (
          <div className="grid gap-s2">
            {p.by_class_30d.map((b) => (
              <div key={b.class} className="flex items-center gap-s3">
                <span className="w-20 shrink-0 text-[12.5px] font-semibold text-ink-900">{b.class}</span>
                <span className="h-s3 rounded-sm bg-ink-900" style={{ width: `${Math.max(4, (b.n / maxBorrow) * 100)}%` }} />
                <span className="text-[12px] tabular-nums text-muted">{b.n}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {p.new_titles.length > 0 ? (
        <Card>
          <CardHead title="Latest catalogue additions" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.new_titles.map((t, i) => <li key={i}>· {t.title}{t.author ? ` — ${t.author}` : ""} ({t.copies_total} copies)</li>)}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================ PATRON — §6.10 ============================ */

export function PatronToday({ p }: { p: PatronPulseData }) {
  return (
    <div className="grid gap-s5">
      <StaffNotice n={p.staff_notice} storageKey="mandela_notice_patron" />
      <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
        <KpiCard label="Leader" value={p.leader_house ?? "—"} note={p.leader_points ? `${p.leader_points} pts` : undefined} />
        <KpiCard label="Events this week" value={String(p.events_week)} />
        <KpiCard label="Kit low" value={String(p.kit_low)} />
        <KpiCard label="Sessions (7d)" value={String(p.sessions_7d)} />
      </div>

      {p.standings.length > 0 ? (
        <Card>
          <CardHead title="House standings" sub="Points across every award this year — token colours only (§8)" />
          <StandingsBars rows={p.standings.map((s) => ({ label: s.house, value: Number(s.points) }))} />
        </Card>
      ) : null}

      <Card>
        <CardHead title="My sections" sub="Sessions and membership — you hold the head hat" />
        {p.my_sections.length === 0 ? (
          <EmptyState title="No sections yet" body="No section names you as patron yet — the admin appoints the hat." />
        ) : (
          <ul className="grid gap-s2">
            {p.my_sections.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{s.name}</span>
                  <span className="block text-[11.5px] text-muted">{s.kind}</span>
                </span>
                <span className="text-[12.5px] text-muted">{s.members} members</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-s3 border-t border-border pt-s3">
          <Link href="/app/operations/sections" className="text-[12.5px] font-semibold underline underline-offset-4">Award house points</Link>
        </div>
      </Card>

      {p.sessions.length > 0 ? (
        <Card>
          <CardHead title="Section sessions — last 7 days" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.sessions.map((s, i) => <li key={i}>· {s.section} — {s.held_on}{s.topic ? `: ${s.topic}` : ""}</li>)}
          </ul>
        </Card>
      ) : null}

      {p.kit_requests.length > 0 ? (
        <Card>
          <CardHead title="Kit at or under floor" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.kit_requests.map((k, i) => <li key={i}>· {k.section}: {k.item} — {k.qty} left (min {k.min_qty})</li>)}
          </ul>
        </Card>
      ) : null}

      {p.events.length > 0 ? (
        <Card>
          <CardHead title="This week's events" />
          <ul className="grid gap-1.5 text-[13px] text-ink-900">
            {p.events.map((e, i) => <li key={i}>· {e.title} — {e.starts_on}</li>)}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================== HOD — §6.11 ============================= */

export function HodToday({ p }: { p: HodPulseData }) {
  // §6.11: HOD view = teacher base + department overlay. No teaching rows →
  // no department to oversee; show the base only.
  const overlay = p.dept_area !== null;
  return (
    <div className="grid gap-s5">
      {/* TeacherToday already renders the shared staff notice (B1) */}
      <TeacherToday p={p.teacher} />
      {overlay ? (
        <Card>
          <CardHead
            title={`Department — ${p.dept_area}`}
            sub={"Coverage, marking and means across the department's lessons"}
          />
          <div className="grid grid-cols-2 gap-s4 sm:grid-cols-4">
            <KpiCard label="Coverage" value={p.coverage_pct !== null ? `${p.coverage_pct}%` : "—"} note="slots with a teacher" />
            <KpiCard label="Unmarked (dept)" value={String(p.unmarked_dept)} />
            <KpiCard label="Dept mean" value={p.dept_mean !== null ? String(p.dept_mean) : "—"} note={p.school_mean !== null ? `school ${p.school_mean}` : undefined} />
            <KpiCard label="Teachers (dept)" value={String(p.dept_teachers)} />
          </div>
          {p.unmarked_by_teacher.length > 0 ? (
            <div className="mt-s3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Unmarked by teacher</p>
              <ul className="mt-s2 grid gap-1.5 text-[13px] text-ink-900">
                {p.unmarked_by_teacher.map((t, i) => <li key={i}>· {t.teacher} — {t.n}</li>)}
              </ul>
            </div>
          ) : null}
          {p.subject_means.length > 0 ? (
            <div className="mt-s3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Subject means vs school mean</p>
              <ul className="mt-s2 grid gap-1.5 text-[13px] text-ink-900">
                {p.subject_means.map((m, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{m.subject}</span>
                    <span className="tabular-nums">{m.mean}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.gaps_today.length > 0 ? (
            <div className="mt-s3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Timetable gaps today</p>
              <ul className="mt-s2 grid gap-1.5 text-[13px] text-ink-900">
                {p.gaps_today.map((g, i) => <li key={i}>· {g.class} P{g.period}{g.area_name ? ` — ${g.area_name}` : ""}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-s3 border-t border-border pt-s3">
            <Link href="/app/academics/marks" className="text-[12.5px] font-semibold underline underline-offset-4">Review unmarked assessments</Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
