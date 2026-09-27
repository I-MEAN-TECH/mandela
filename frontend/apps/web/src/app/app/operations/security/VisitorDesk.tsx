"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, DataTable, StatusPill } from "@mandela/ui";
import { logVisitorAction, checkoutVisitorAction, type VisitorRow } from "@/lib/api";

/**
 * Visitor desk (flank batch D) — one form for the gate, one table for the
 * book. Check-in mints the gate-pass number; check-out stamps the exit.
 */
export function VisitorDesk({ rows }: { rows: VisitorRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function checkIn(fd: FormData) {
    const visitor = String(fd.get("visitor") ?? "").trim();
    const visiting = String(fd.get("visiting") ?? "").trim();
    if (visitor.length < 2 || !visiting) {
      setMsg({ ok: false, text: "Name and who they are visiting are both required." });
      return;
    }
    start(async () => {
      const r = await logVisitorAction({
        visitor,
        visiting,
        idNo: String(fd.get("idNo") ?? "") || undefined,
        phone: String(fd.get("phone") ?? "") || undefined,
        purpose: String(fd.get("purpose") ?? "") || undefined,
      });
      if (r.ok && r.data && typeof r.data === "object" && "pass" in r.data) {
        setMsg({ ok: true, text: `${visitor} signed in — gate pass ${(r.data as { pass: string }).pass}. Hand it over.` });
        (document.getElementById("visitor-form") as HTMLFormElement | null)?.reset();
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "Failed" });
      }
    });
  }

  function checkOut(id: string, name: string) {
    start(async () => {
      const r = await checkoutVisitorAction({ id });
      setMsg(r.ok ? { ok: true, text: `${name} checked out.` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card className="min-w-0">
        <CardHead title="Visitor book" sub="Last 7 days — the record the county inspector asks for." />
        {rows.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-500">No visitors yet this week. The first sign-in starts the book.</p>
        ) : (
          <DataTable
            columns={[
              { key: "visitor", title: "Visitor" },
              { key: "visiting", title: "Visiting" },
              { key: "pass", title: "Pass" },
              { key: "in", title: "In" },
              { key: "out", title: "" },
            ]}
            rows={rows.map((r) => ({
              visitor: (
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-950">{r.visitor}</p>
                  {r.id_no ? <p className="text-[11.5px] text-ink-500">ID {r.id_no}</p> : null}
                </div>
              ),
              visiting: (
                <div>
                  <p className="text-[13px] text-ink-900">{r.visiting}</p>
                  {r.purpose ? <p className="text-[11.5px] text-ink-500">{r.purpose}</p> : null}
                </div>
              ),
              pass: r.pass_no ? <span className="font-mono text-[12px] text-ink-700">{r.pass_no}</span> : "—",
              in: new Date(r.time_in).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
              out: r.time_out ? (
                <StatusPill tone="neutral">out</StatusPill>
              ) : (
                <Button variant="secondary" disabled={pending} onClick={() => checkOut(r.id, r.visitor)}>
                  Check out
                </Button>
              ),
            }))}
          />
        )}
        {msg ? <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
      </Card>

      <Card>
        <CardHead title="Sign a visitor in" sub="Thirty seconds at the gate. The pass number prints on the sticker." />
        <form
          id="visitor-form"
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            checkIn(new FormData(e.currentTarget));
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Full name *</span>
            <input name="visitor" required minLength={2} maxLength={80} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">ID number</span>
            <input name="idNo" maxLength={20} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Phone</span>
            <input name="phone" inputMode="tel" maxLength={20} className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Visiting *</span>
            <input name="visiting" required maxLength={120} placeholder="Grade 7 Blue · Amina" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Purpose</span>
            <input name="purpose" maxLength={200} placeholder="Pick up at 3pm" className="h-10 rounded-sm border border-paper-300 bg-surface px-3 text-[13.5px] text-ink-950" />
          </label>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Signing in…" : "Sign in & issue pass"}</Button>
        </form>
      </Card>
    </div>
  );
}
