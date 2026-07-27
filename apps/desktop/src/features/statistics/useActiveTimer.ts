import { useCallback, useEffect, useRef, useState } from "react";

export interface ActiveTimer {
  activeMs: number;
  markActivity(): void;
  reset(): void;
  snapshot(): number;
}

export function useActiveTimer(
  { idleAfterMs = 90_000, running = true }: { idleAfterMs?: number; running?: boolean } = {},
): ActiveTimer {
  const [activeMs, setActiveMs] = useState(0);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef(Date.now());
  const lastActivityRef = useRef(Date.now());
  const idleAfterMsRef = useRef(idleAfterMs);
  idleAfterMsRef.current = idleAfterMs;
  const runningRef = useRef(running);
  runningRef.current = running;
  const hiddenRef = useRef(false);

  const publish = useCallback((value: number) => {
    const normalized = Math.max(0, Math.round(value));
    setActiveMs(normalized);
  }, []);

  const snapshot = useCallback(() => {
    if (!runningRef.current || hiddenRef.current) {
      return accumulatedRef.current;
    }
    const now = Date.now();
    const activeUntil = Math.min(now, lastActivityRef.current + idleAfterMsRef.current);
    const openSegment = Math.max(0, activeUntil - segmentStartRef.current);
    return accumulatedRef.current + openSegment;
  }, []);

  useEffect(() => {
    if (!running) return;
    segmentStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    hiddenRef.current = false;
    const id = setInterval(() => {
      if (hiddenRef.current || !runningRef.current) return;
      publish(snapshot());
    }, 100);
    return () => clearInterval(id);
  }, [running, publish, snapshot]);

  const markActivity = useCallback(() => {
    if (!runningRef.current) return;
    const now = Date.now();
    const activeUntil = Math.min(now, lastActivityRef.current + idleAfterMsRef.current);
    accumulatedRef.current += Math.max(0, activeUntil - segmentStartRef.current);
    segmentStartRef.current = now;
    lastActivityRef.current = now;
    publish(accumulatedRef.current);
  }, [publish]);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    segmentStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    publish(0);
  }, [publish]);

  useEffect(() => {
    if (!running) return;
    const events = ["pointerdown", "keydown", "wheel", "scroll"] as const;
    const handler = () => markActivity();
    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
    };
  }, [running, markActivity]);

  useEffect(() => {
    if (!running) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        const now = Date.now();
        const activeUntil = Math.min(now, lastActivityRef.current + idleAfterMsRef.current);
        accumulatedRef.current += Math.max(0, activeUntil - segmentStartRef.current);
        publish(accumulatedRef.current);
        hiddenRef.current = true;
      } else {
        segmentStartRef.current = Date.now();
        lastActivityRef.current = Date.now();
        hiddenRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [running, publish]);
  return { activeMs, markActivity, reset, snapshot };
}
