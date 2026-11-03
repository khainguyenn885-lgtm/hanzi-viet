import { useEffect } from "react";
import { submitActiveTime } from "./api";

const IDLE_AFTER_MS = 15_000;
const MAX_PULSE_MS = 30_000;
const SYNC_EVERY_MS = 60_000;

export function useActiveTimeTracker(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let active = false;
    let lastInteraction = 0;
    let lastAccounted = 0;
    let pendingMs = 0;
    let sending = false;
    const clock = () => performance.now();
    const accrue = (now: number) => {
      if (!active) return;
      const until = Math.min(now, lastInteraction + IDLE_AFTER_MS, lastAccounted + MAX_PULSE_MS);
      if (until > lastAccounted) pendingMs += until - lastAccounted;
      lastAccounted = Math.max(lastAccounted, until);
      if (now - lastInteraction >= IDLE_AFTER_MS) active = false;
    };
    const sendPending = async (now = clock()) => {
      accrue(now);
      const seconds = Math.floor(pendingMs / 1000);
      if (seconds <= 0 || sending) return;
      sending = true;
      pendingMs -= seconds * 1000;
      try { await submitActiveTime(seconds); }
      catch { pendingMs += seconds * 1000; }
      finally { sending = false; }
    };
    const onInteraction = () => {
      if (document.visibilityState !== "visible") return;
      const now = clock();
      if (active) accrue(now);
      if (!active) lastAccounted = now;
      active = true;
      lastInteraction = now;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void sendPending();
        active = false;
      } else onInteraction();
    };
    const onPageHide = () => { void sendPending(); active = false; };
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "touchstart", "scroll"];
    for (const event of events) window.addEventListener(event, onInteraction, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const ticker = window.setInterval(() => {
      accrue(clock());
      if (pendingMs >= SYNC_EVERY_MS) void sendPending();
    }, 1000);
    return () => {
      window.clearInterval(ticker);
      for (const event of events) window.removeEventListener(event, onInteraction);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      void sendPending();
    };
  }, [enabled]);
}
