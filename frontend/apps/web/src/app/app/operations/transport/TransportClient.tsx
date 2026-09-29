"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill, EmptyState } from "@mandela/ui";
import {
  upsertRouteAction, upsertBusAction, addStopAction, runTripAction, setRouteActiveAction,
  deleteRouteAction, deleteBusAction, type TransportData,
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
  const [rEditId, setREditId] = useState<string | null>(null);
  const [bReg, setBReg] = useState("");
  const [bCap, setBCap] = useState(30);
  const [bRoute, setBRoute] = useState("");
  const [bEditId, setBEditId] = useState<string | null>(null);
  const [stopRoute, setStopRoute] = useState("");
  const [stopName, setStopName] = useState("");
  const [stopAt, setStopAt] = useState("");
  const [tripBus, setTripBus] = useState("");
  const [tripDir, setTripDir] = useState<"am" | "pm">("am");

  const editRoute = (r: TransportData["routes"][number]) => {
    setREditId(r.id); setRName(r.name); setRFee(String(Math.round(Number(r.fee_term_cents) / 100)));
    document.querySelector("#route-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const removeRoute = (r: TransportData["routes"][number]) => {
    if (!confirm(`Delete route “${r.name}” permanently? Its ${r.points} stop${r.points === 1 ? "" : "s"} and trip history are deleted; ${r.learners} rider manifest entr${r.learners === 1 ? "y is" : "ies are"} removed. This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteRouteAction({ id: r.id });
      if (!res.ok) { setMsg(res.error ?? "could not delete the route"); return; }
      setMsg(`Route “${r.name}” deleted.`);
      router.refresh();
    });
  };

  const editBus = (b: TransportData["buses"][number]) => {
    setBEditId(b.id); setBReg(b.reg_no); setBCap(b.capacity); setBRoute(b.route_name ? (routes.find((r) => r.name === b.route_name)?.id ?? "") : "");
    document.querySelector("#bus-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const removeBus = (b: TransportData["buses"][number]) => {
    if (!confirm(`Delete bus “${b.reg_no}” permanently? Its trip history is deleted. This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteBusAction({ id: b.id });
      if (!res.ok) { setMsg(res.error ?? "could not delete the bus"); return; }
      setMsg(`Bus “${b.reg_no}” deleted.`);
      router.refresh();
    });
  };

  const saveRoute = () => {
    if (rName.trim().length < 2) return;
    start(async () => {
      const r = await upsertRouteAction({ id: rEditId ?? undefined, name: rName.trim(), feeTermCents: rFee ? Math.round(Number(rFee) * 100) : 0 });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setRName(""); setRFee(""); setREditId(null); setMsg(rEditId ? "Route updated." : "Route saved.");
      router.refresh();
    });
  };

  const saveBus = () => {
    if (bReg.trim().length < 3) return;
    start(async () => {
      const r = await upsertBusAction({ id: bEditId ?? undefined, regNo: bReg.trim(), capacity: bCap, routeId: bRoute || null });
      if (!r.ok) { setMsg(r.error ?? "failed"); return; }
      setBReg(""); setBEditId(null); setMsg(bEditId ? "Bus updated." : "Bus saved.");
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
    <div className="grid gap-s4">
      <Card>
        <CardHead title="Routes" sub="Term fee rides Money as a levy — never cash at the gate." />
        {routes.length === 0 ? (
          <EmptyState title="No routes yet" body="Add the first route — name and term fee per rider." />
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {routes.map((r) => (
              <RouteRow key={r.id} route={r} onMsg={setMsg} onEdit={() => editRoute(r)} onDelete={() => removeRoute(r)} />
            ))}
          </div>
        )}
        <div id="route-form" className="flex flex-col gap-s2 border-t border-border p-s5">
          <div className="flex flex-col gap-s1">
            <span className="microlabel">{rEditId ? `Editing "${rName || "route"}"` : "New route"}</span>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Route name — Kilimani AM" value={rName} onChange={(e) => setRName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-s1">
            <span className="microlabel">Term fee per rider (Ksh)</span>
            <input type="number" min={0} className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="2500" value={rFee} onChange={(e) => setRFee(e.target.value)} />
          </div>
          <div className="flex items-center gap-s2">
            <Button variant="primary" disabled={pending} onClick={saveRoute}>{rEditId ? "Save changes" : "Save route"}</Button>
            {rEditId ? <Button disabled={pending} onClick={() => { setREditId(null); setRName(""); setRFee(""); }}>Cancel edit</Button> : null}
          </div>
          <div className="mt-s2 flex flex-col gap-s1 border-t border-border pt-s3">
            <span className="microlabel">Add a pickup stop</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={stopRoute} onChange={(e) => setStopRoute(e.target.value)}>
              <option value="">— add stop to —</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Stop name — Gitanga Road" value={stopName} onChange={(e) => setStopName(e.target.value)} />
            <div className="flex gap-s2">
              <input className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="06:40" value={stopAt} onChange={(e) => setStopAt(e.target.value)} />
              <Button disabled={pending || !stopRoute} onClick={addStop}>+ Stop</Button>
            </div>
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
              <div key={b.id} className="flex flex-col gap-s1 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-text">{b.reg_no}</span>
                  <span className="text-xs text-muted">{b.capacity} seats · {b.route_name ?? "unassigned"}</span>
                </div>
                <div className="flex items-center gap-s3">
                  <button type="button" className="text-xs text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => editBus(b)}>Edit</button>
                  <button type="button" className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => removeBus(b)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div id="bus-form" className="flex flex-col gap-s2 border-t border-border p-s5">
          <span className="microlabel">{bEditId ? `Editing "${bReg || "bus"}"` : "New bus"}</span>
          <input className="rounded-md border border-border bg-surface px-3 py-2 text-sm" placeholder="Registration — KDA 001X" value={bReg} onChange={(e) => setBReg(e.target.value)} />
          <div className="flex items-center gap-s2">
            <input type="number" min={1} className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm" value={bCap} onChange={(e) => setBCap(Number(e.target.value) || 1)} />
            <span className="text-xs text-muted">seats</span>
            <select className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm" value={bRoute} onChange={(e) => setBRoute(e.target.value)}>
              <option value="">— route —</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-s2">
            <Button disabled={pending} onClick={saveBus}>{bEditId ? "Save changes" : "Save bus"}</Button>
            {bEditId ? <Button disabled={pending} onClick={() => { setBEditId(null); setBReg(""); setBRoute(""); setBCap(30); }}>Cancel edit</Button> : null}
          </div>
          <div className="mt-s2 flex flex-col gap-s1 border-t border-border pt-s3">
            <span className="microlabel">Log today's run</span>
            <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={tripBus} onChange={(e) => setTripBus(e.target.value)}>
              <option value="">— log trip for —</option>
              {buses.filter((b) => b.route_name).map((b) => <option key={b.id} value={b.id}>{b.reg_no} → {b.route_name}</option>)}
            </select>
            <div className="flex items-center gap-s2">
              <select className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm" value={tripDir} onChange={(e) => setTripDir(e.target.value as "am" | "pm")}>
                <option value="am">AM</option><option value="pm">PM</option>
              </select>
              <Button disabled={pending || !tripBus} onClick={() => markTrip(false)}>Ran</Button>
              <Button variant="primary" disabled={pending || !tripBus} onClick={() => markTrip(true)}>Done</Button>
            </div>
          </div>
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

function RouteRow({
  route, onMsg, onEdit, onDelete,
}: {
  route: TransportData["routes"][number];
  onMsg: (m: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-s1 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-s2">
        <span className="font-semibold text-text">{route.name}</span>
        <span className="text-muted"><Money cents={route.fee_term_cents} className="text-[13px]" /> / term</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-s2">
        <span className="text-xs text-muted">
          {route.learners} riders · {route.points} stops
          {!route.active ? <span className="ml-s2 font-semibold text-warn">off — hidden from manifests</span> : null}
        </span>
        <span className="flex items-center gap-s3">
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-text hover:underline" onClick={onEdit}>Edit</button>
          <button
            type="button"
            className="text-xs text-muted underline-offset-2 hover:text-text hover:underline"
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
          </button>
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline" onClick={onDelete}>Delete</button>
        </span>
      </div>
    </div>
  );
}
