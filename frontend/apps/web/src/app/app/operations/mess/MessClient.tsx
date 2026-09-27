"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import { setMealAction, takeHeadCountAction } from "@/lib/api";

/**
 * Mess client (flank batch D) — menu board and head-count board. Every
 * cell is editable in place; saves are audited one at a time.
 */

const inputCx = "w-full rounded-sm border border-paper-300 bg-surface px-2.5 py-1.5 text-[13px] text-ink-950";

export function MenuBoard({
  weekStart,
  menu,
  dayNames,
  meals,
}: {
  weekStart: string;
  menu: { day: number; meal: string; items: string }[];
  dayNames: string[];
  meals: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [day, setDay] = useState(1);
  const [meal, setMeal] = useState("lunch");
  const [items, setItems] = useState("");

  function save() {
    if (items.trim().length === 0) {
      setMsg({ ok: false, text: "Write what will be served." });
      return;
    }
    start(async () => {
      const r = await setMealAction({ weekStart, day, meal, items: items.trim() });
      setMsg(r.ok ? { ok: true, text: `${dayNames[day - 1]} ${meal} saved.` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) {
        setItems("");
        router.refresh();
      }
    });
  }

  const existing = menu.find((m) => m.day === day && m.meal === meal);

  return (
    <Card>
      <CardHead title="This week's menu" sub="Pick a day and meal, write the dishes. The kitchen and guardians see the same board." />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Day</th>
              {meals.map((m) => (
                <th key={m} className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayNames.map((d, i) => (
              <tr key={d} className={(i + 1) === new Date().getDay() ? "bg-pine-50" : ""}>
                <td className="px-2 py-1.5 font-semibold text-ink-900">{d}</td>
                {meals.map((m) => (
                  <td key={m} className="px-2 py-1.5 text-ink-700">
                    {menu.find((x) => x.day === i + 1 && x.meal === m)?.items ?? <span className="text-ink-400">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <select value={day} onChange={(e) => { setDay(Number(e.target.value)); setItems(""); }} className={inputCx}>
          {dayNames.map((d, i) => (
            <option key={d} value={i + 1}>{d}</option>
          ))}
        </select>
        <select value={meal} onChange={(e) => { setMeal(e.target.value); setItems(""); }} className={inputCx}>
          {meals.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={existing ? existing.items : "e.g.Beans, chapati, cabbage"}
          className={inputCx}
          maxLength={300}
        />
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {msg ? <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
    </Card>
  );
}

export function HeadCountBoard({
  weekStart,
  counts,
  dayNames,
  meals,
}: {
  weekStart: string;
  counts: { meal_day: string; meal: string; head_count: number }[];
  dayNames: string[];
  meals: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [meal, setMeal] = useState("lunch");
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");

  function save() {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0) {
      setMsg({ ok: false, text: "Head-count is a number." });
      return;
    }
    start(async () => {
      const r = await takeHeadCountAction({ mealDay: new Date().toISOString().slice(0, 10), meal, headCount: n, note: note || undefined });
      setMsg(r.ok ? { ok: true, text: `${n} counted for ${meal}.` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) {
        setCount("");
        setNote("");
        router.refresh();
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHead title="Head-count" sub="Count heads per meal — the cook draws stock against this number." />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {meals.map((m) => {
          const c = counts.find((x) => x.meal_day === today && x.meal === m);
          return (
            <span key={m} className={`rounded-pill px-3 py-1 text-[12px] font-semibold ${c ? "bg-pine-100 text-pine-800" : "bg-paper-100 text-ink-500"}`}>
              {m}: {c ? c.head_count : "—"}
            </span>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <select value={meal} onChange={(e) => setMeal(e.target.value)} className={inputCx}>
          {meals.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={count}
          onChange={(e) => setCount(e.target.value)}
          inputMode="numeric"
          placeholder="Heads"
          className={`${inputCx} max-w-[110px]`}
          maxLength={5}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Stock drawn (optional)"
          className={inputCx}
          maxLength={300}
        />
        <Button variant="primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Count"}</Button>
      </div>
      {msg ? <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">{msg.text}</p> : null}
      <p className="mt-2 text-[11.5px] text-ink-500">Week of {weekStart}. Yesterday's counts stay on the ledger — never overwritten, only superseded.</p>
    </Card>
  );
}
