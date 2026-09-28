"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill, EmptyState } from "@mandela/ui";
import {
  upsertRouteAction, upsertBusAction, addStopAction, runTripAction, setRouteActiveAction, type TransportData,
} from "@/lib/api";

/** Transport client — routes & fees, buses, stops, AM/PM trips. */
export function TransportClient({
  routes,
  buses,
  trips,
}: {
  routes: TransportData["routes"];
  buses: TransportData["buses"];
  trips: TransportData["trips"];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [rName, setRName] = useState("");
  const [rFee, setRFee] = useState("");
  const [bReg, setBReg] = useState("");
  const [bCap, setBCap] = useState(30);
  const [bRoute, setBRoute] = useState("");
  const [stopRoute, setStopRoute] = useState("");
  const [stopName, setStopName] = useState("");
  const [stopAt, setStopAt] = useState("");
  const [tripBus, setTripBus] = useState("");
  const [tripDir, setTripDir] = useState<"am" | "pm">("am");

  const addRoute = () => {
    if (rName.trim().length < 2) return;
    start(async () => {
      const r = await upsertRouteAction({ name: rName.trim(), feeTermCents: rFee ? Math.round(Number(rFee) * 100) : 0 });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setRName(""); setRFee(""); setMsg("Route saved.");
      router.refresh();
    });
  };

  const addBus = () => {
    if (bReg.trim().length < 3) return;
    start(async () => {
      const r = await upsertBusAction({ regNo: bReg.trim(), capacity: bCap, routeId: bRoute || null });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setBReg(""); setMsg("Bus saved.");
      router.refresh();
    });
  };

  const addStop = () => {
    if (!stopRoute || stopName.trim().length < 2) return;
    start(async () => {
      const r = await addStopAction({ routeId: stopRoute, name: stopName.trim(), pickupAt: stopAt || null });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setStopName(""); setStopAt(""); setMsg("Stop added to the route.");
      router.refresh();
    });
  };

  const markTrip = (done: boolean) => {
    const route = buses.find((b) => b.id === tripBus)?.route_name;
    const r = routes.find((x) => x.name === route);
    if (!tripBus || !r) { setMsg("Pick a bus assigned to a route."); return; }
    start(async () => {
      await runTripAction({ busId: tripBus, routeId: r.id, direction: tripDir, done });
      setMsg(`Trip logged (${tripDir.toUpperCase()}${done ? ", done" : ""}).`);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-s4 xl:grid-cols-2">
      <Card>          <CardHead title="Routes" sub="Term fee rides Money as a levy — never cash at the gate." />
        {routes.length === 0 ? (
          <EmptyState title="No routes yet" body="Add the first route — name and term fee per rider." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {routes.map((r) => (
              <RouteRow key={r.id} route={r} onMsg={setMsg} />
            ))}
          </div>
        )}
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-3">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Kilimani AM" value={rName} onChange={(e) => setRName(e.target.value)} />
          <input type="number" min={0} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Term fee Ksh" value={rFee} onChange={(e) => setRFee(e.target.value)} />
          <Button variant="primary" disabled={pending} onClick={addRoute}>Save route</Button>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm sm:col-span-1" value={stopRoute} onChange={(e) => setStopRoute(e.target.value)}>
            <option value="">— add stop to —</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Gitanga Road stop" value={stopName} onChange={(e) => setStopName(e.target.value)} />
          <div className="flex gap-s2">
            <input className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="06:40" value={stopAt} onChange={(e) => setStopAt(e.target.value)} />
            <Button disabled={pending || !stopRoute} onClick={addStop}>+ Stop</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Buses & trips" sub="Assign a bus to a route; log the AM/PM run." />
        {buses.length === 0 ? (
          <p className="p-s5 text-sm text-muted">No buses yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {buses.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono font-semibold text-text">{b.reg_no}</span>
                <span className="text-muted">{b.capacity} seats · {b.route_name ?? "unassigned"}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-s2 border-t border-border p-s5 sm:grid-cols-4">
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="KDA 001X" value={bReg} onChange={(e) => setBReg(e.target.value)} />
          <input type="number" min={1} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={bCap} onChange={(e) => setBCap(Number(e.target.value) || 1)} />
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={bRoute} onChange={(e) => setBRoute(e.target.value)}>
            <option value="">— route —</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Button disabled={pending} onClick={addBus}>Save bus</Button>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={tripBus} onChange={(e) => setTripBus(e.target.value)}>
            <option value="">— log trip for —</option>
            {buses.filter((b) => b.route_name).map((b) => <option key={b.id} value={b.id}>{b.reg_no} → {b.route_name}</option>)}
          </select>
          <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={tripDir} onChange={(e) => setTripDir(e.target.value as "am" | "pm")}>
            <option value="am">AM</option><option value="pm">PM</option>
          </select>
          <Button disabled={pending || !tripBus} onClick={() => markTrip(false)}>Ran</Button>
          <Button variant="primary" disabled={pending || !tripBus} onClick={() => markTrip(true)}>Done</Button>
        </div>
        {msg ? <p className="px-s5 pb-s4 text-sm text-ok">{msg}</p> : null}
      </Card>

      <Card className="xl:col-span-2">
        <CardHead title="Trip log" sub="Last 20 runs — the driver dashboard reads the same rows." />
        {trips.length === 0 ? (
          <p className="p-s5 text-sm text-muted">No trips logged yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {trips.map((t) => (
              <div key={t.id} className="flex items-center gap-s2 py-2 text-sm">
                <span className="w-24 font-mono text-[11px] text-muted">{t.ran_on}</span>
                <StatusPill tone={t.direction === "am" ? "ok" : "warn"}>{t.direction.toUpperCase()}</StatusPill>
                <span className="font-semibold text-text">{t.route_name}</span>
                <span className="font-mono text-xs text-muted">{t.reg_no}</span>
                <StatusPill tone={t.done ? "ok" : "neutral"}>{t.done ? "done" : "ran"}</StatusPill>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RouteRow({ route, onMsg }: { route: TransportData["routes"][number]; onMsg: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span>
        <span className="font-semibold text-text">{route.name}</span>
        <span className="ml-s2 text-xs text-muted">{route.learners} riders · {route.points} stops</span>
        {!route.active ? <span className="ml-s2 text-[11px] font-semibold text-warn">off — hidden from manifests</span> : null}
      </span>
      <span className="flex items-center gap-s3">
        <span className="text-muted"><Money cents={route.fee_term_cents} className="text-[13px]" /> / term</span>
        <Button
          size="sm2"
          variant={route.active ? "ghost" : "secondary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setRouteActiveAction({ id: route.id, active: !route.active });
              onMsg(
                r.ok
                  ? route.active
                    ? route.name + " switched off — history kept."
                    : route.name + " is running again."
                  : r.error ?? "could not update",
              );
              if (r.ok) router.refresh();
            })
          }
        >
          {route.active ? "Switch off" : "Switch on"}
        </Button>
      </span>
    </div>
  );
}
