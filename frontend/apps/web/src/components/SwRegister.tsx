"use client";

import { useEffect } from "react";

/**
 * Registers the read-cache service worker (flank #5). Render once in the root layout.
 * Dev guard: a cache-first SW over unhashed dev chunks serves permanently stale
 * screens, so in development we unregister and drop the caches instead. Only
 * production builds (content-hashed assets) get the SW.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW is a progressive enhancement — never blocks the app */
    });
  }, []);
  return null;
}
