"use client";

import { useCallback, useEffect, useState } from "react";
import { flushOutboxAction } from "@/lib/api";

/**
 * SyncBanner (flank #5) — the explicit sync state, never silent.
 * Reads cache via the SW; writes queue here (localStorage) and flush
 * when connectivity returns. Money ops are rejected server-side by
 * design — docs/OFFLINE-CONSTRAINTS.md is the law this implements.
 */

const KEY = "mandela_outbox_v1";

interface QueuedOp {
  client_id: string;
  op: string;
  payload: Record<string, unknown>;
  created_at: string;
}

function readQueue(): QueuedOp[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedOp[]) {
  window.localStorage.setItem(KEY, JSON.stringify(q));
}

/** Queue a write for later flush. Returns the client id (idempotency key). */
export function queueOfflineOp(op: string, payload: Record<string, unknown>): string {
  const client_id = crypto.randomUUID();
  const q = readQueue();
  q.push({ client_id, op, payload, created_at: new Date().toISOString() });
  writeQueue(q);
  return client_id;
}

export function SyncBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const q = readQueue();
    if (q.length === 0) return;
    setFlushing(true);
    const remaining: QueuedOp[] = [];
    let rejected = 0;
    for (const item of q) {
      try {
        const r = await flushOutboxAction({ clientId: item.client_id, op: item.op, payload: item.payload });
        // duplicate == already applied by an earlier flush; treat as applied.
        if (r.ok && (r.data as { state?: string } | undefined)?.state === "rejected") rejected++;
        if (!r.ok && (r.error ?? "").includes("session")) remaining.push(item); // auth lost mid-flush: keep
      } catch {
        remaining.push(item); // network died mid-flush; retry next round
      }
    }
    writeQueue(remaining);
    setPending(remaining.length);
    setFlushing(false);
    setNote(rejected > 0 ? `${rejected} op${rejected === 1 ? "" : "s"} refused — see the sync rules (money never queues).` : null);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(readQueue().length);
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === "visible") void flush(); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  if (online && pending === 0 && !note) return null;

  return (
    <div
      role="status"
      className={`mb-3 flex flex-wrap items-center gap-2 rounded-sm border px-3.5 py-2 text-[12.5px] font-semibold ${
        !online ? "border-paper-300 bg-paper-100 text-ink-700"
        : pending > 0 ? "border-warn bg-warn-bg text-warn"
        : "border-danger bg-danger-bg text-danger"
      }`}
    >
      {!online ? (
        <>Offline — reads still work, {pending > 0 ? `${pending} write${pending === 1 ? "" : "s"} queued` : "writes will queue"}. Money is keyed online when you reconnect.</>
      ) : pending > 0 ? (
        <>
          {flushing ? "Syncing…" : `${pending} queued write${pending === 1 ? "" : "s"} waiting`}
          <button onClick={() => void flush()} disabled={flushing} className="rounded-pill border border-ink-950/20 px-2.5 py-0.5 text-[11.5px] hover:bg-surface">
            Sync now
          </button>
        </>
      ) : (
        <>{note}</>
      )}
    </div>
  );
}
