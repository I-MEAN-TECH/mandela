"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, StatusPill } from "@mandela/ui";
import { awardHousePointsAction, chargeActivityFeeAction, createHouseCompetitionAction, type HouseRow, type CoCurricularData, type HouseCompetitionRow } from "@/lib/api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HousesClient({ houses, sections, fees, competitions }: {
  houses: HouseRow[];
  sections: CoCurricularData["sections"];
  fees: CoCurricularData["fees"];
  competitions: HouseCompetitionRow[];
}) {
  function competition() {
    if (houses.length === 0) { setMsg({ ok: false, text: "Create the house sections first." }); return; }
    const houseName = window.prompt(`Which house hosts it? (${houses.map((h) => h.name).join(" / ")})`, houses[0]?.name ?? "");
    if (!houseName) return;
    const house = houses.find((h) => h.name.toLowerCase() === houseName.trim().toLowerCase());
    if (!house) { setMsg({ ok: false, text: `No house called “${houseName}”.` }); return; }
    const title = window.prompt("Competition name (e.g. Inter-house Athletics Day)", "") ?? "";
    if (title.trim().length < 3) { setMsg({ ok: false, text: "Give the competition a name." }); return; }
    const date = window.prompt("Date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10)) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { setMsg({ ok: false, text: "Use the YYYY-MM-DD date shape." }); return; }
    start(async () => {
      const r = await createHouseCompetitionAction({ houseId: house.id, title: title.trim(), startsOn: date.trim() });
      setMsg(r.ok ? { ok: true, text: `${title.trim()} is on the calendar — ${house.name}.` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function award(houseId: string, name: string, current: number) {
    const raw = window.prompt(`Points for ${name} (negative to deduct) — current ${current}`, "10");
    if (raw === null) return;
    const points = parseInt(raw, 10);
    if (!Number.isFinite(points) || points === 0) return;
    const reason = window.prompt("Reason (what happened)?", "") ?? "";
    if (!reason.trim()) { setMsg({ ok: false, text: "Every points award needs a reason — that is the audit trail." }); return; }
    start(async () => {
      const r = await awardHousePointsAction({ houseId, points, reason });
      setMsg(r.ok ? { ok: true, text: `${points > 0 ? "+" : ""}${points} ${name}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  function fee(sectionId: string, name: string) {
    const raw = window.prompt(`Activity fee amount (Ksh) for ${name}`, "500");
    if (raw === null) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const what = window.prompt("What is it for?", "Term activity fee") ?? "";
    start(async () => {
      const r = await chargeActivityFeeAction({ sectionId, termId: 1, name: what || "Term activity fee", amountCents: amount * 100 });
      setMsg(r.ok ? { ok: true, text: `${name}: Ksh ${amount.toLocaleString()} charged` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead title="House points" sub="The standings — tap a house to award or deduct points" />
        <div className="flex flex-col divide-y divide-paper-200">
          {houses.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No houses yet — sections of kind &ldquo;house&rdquo; appear here.</p>
          ) : houses.map((h, i) => (
            <button key={h.id} onClick={() => award(h.id, h.name, h.points)}
              className="flex items-center gap-3 py-3 text-left transition-colors hover:bg-paper-100">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm font-mono text-[13px] font-bold text-white" style={{ background: h.colour }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-ink-950">{h.name}</span>
                {h.mascot ? <span className="block text-[12px] text-muted">{h.mascot}</span> : null}
              </span>
              <span className="font-mono text-[15px] font-bold text-ink-950">{h.points.toLocaleString()}</span>
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">pts</span>
            </button>
          ))}
        </div>
        <p className="border-t border-paper-200 px-4 py-2.5 text-[11.5px] text-muted">
          Every award is audited with its reason — no anonymous points.
        </p>
      </Card>

      <Card>
        <CardHead title="Activity sections" sub="Clubs, teams and arts — with member counts" />
        <div className="flex flex-col divide-y divide-paper-200">
          {sections.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No activity sections yet.</p>
          ) : sections.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-[140px] flex-1">
                <p className="text-[13.5px] font-semibold text-ink-950">{s.name}</p>
                <p className="text-[12px] text-muted">{s.members} member{s.members === 1 ? "" : "s"} · {s.events} event{s.events === 1 ? "" : "s"}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => fee(s.id, s.name)}>Charge fee</Button>
            </div>
          ))}
        </div>
      </Card>

      {fees.length > 0 ? (
        <Card className="lg:col-span-2">
          <CardHead title="Activity fees this term" sub="Charged through the normal invoice pipeline" />
          <div className="flex flex-col divide-y divide-paper-200">
            {fees.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <p className="text-[13px] font-semibold text-ink-950">{f.name} <span className="font-normal text-muted">· {f.section}</span></p>
                <p className="font-mono text-[13px]">Ksh {(f.amount_cents / 100).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="lg:col-span-2">
        <CardHead
          title="House competitions"
          sub="Calendar rows of kind house-competition — results land as audited points awards"
          action={<Button size="sm" variant="secondary" disabled={pending} onClick={competition}>New competition</Button>}
        />
        {competitions.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-muted">None scheduled yet — a competition is a calendar event, not a new module.</p>
        ) : (
          <div className="flex flex-col divide-y divide-paper-200">
            {competitions.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-[92px] font-mono text-[12px] text-muted">{c.starts_on}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-950">{c.title}</span>
                  <span className="block text-[12px] text-muted">{c.house}{c.notes ? ` · ${c.notes}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {msg ? (
        <p className={`lg:col-span-2 text-[13px] font-semibold ${msg.ok ? "text-primary" : "text-danger"}`} role="status">{msg.text}</p>
      ) : null}
    </div>
  );
}
