"use client";

import { useEffect, useState } from "react";
import { Button } from "@mandela/ui";

/**
 * InstallPrompt — Phase 7 A2HS (DEV-PHASES). Captures the browser's
 * `beforeinstallprompt` and, once the user is signed in on /app, offers the
 * install with ONE tap. iOS Safari never fires that event — it gets the
 * instructions sheet (Share → Add to Home Screen) instead. Session-only:
 * dismissed means dismissed for the week (per-device localStorage), never
 * nagged again mid-session.
 */

interface BipEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mandela_install_dismissed_at";
const DISMISS_DAYS = 7;

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > Date.now() - DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports navigator.standalone when launched from the home screen.
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BipEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BipEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    // iOS: no event exists — offer the sheet once, only on a phone-class screen.
    if (isIos() && window.innerWidth < 820) {
      const t = window.setTimeout(() => setShowIos(true), 1200);
      setHidden(false);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBip);
        window.clearTimeout(t);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* private mode */ }
    setHidden(true);
  };

  const installed = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Install the school app"
      className="mb-3 flex flex-wrap items-center justify-between gap-s3 rounded-sm border border-border bg-paper-50 px-s3 py-s2"
    >
      {showIos && !deferred ? (
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-800">
          <span className="font-semibold">Put school on your home screen:</span>{" "}
          tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>. It opens full-screen, like an app.
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-800">
          <span className="font-semibold">Install the app</span> — one tap, no
          store, works offline after your first visit.
        </p>
      )}
      {deferred ? (
        <Button variant="secondary" onClick={() => void installed()}>
          Install
        </Button>
      ) : null}
      <button
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
        className="rounded-pill px-2 py-1 text-[12px] font-semibold text-muted hover:bg-paper-100"
      >
        Later
      </button>
    </div>
  );
}
