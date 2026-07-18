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

  useEffect(() => {
    if (!running) return;
    segmentStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    hiddenRef.current = false;
    const id = setInterval(() => {
      if (hiddenRef.current || !runningRef.current) return;
      const now = Date.now();
      const elapsed = now - segmentStartRef.current;
      const idleElapsed = now - lastActivityRef.current;
      if (idleElapsed >= idleAfterMsRef.current) {
        setActiveMs(accumulatedRef.current + idleAfterMsRef.current);
      } else {
        setActiveMs(accumulatedRef.current + elapsed);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const markActivity = useCallback(() => {
    if (!runningRef.current) return;
    const now = Date.now();
    const elapsed = now - segmentStartRef.current;
    const idleElapsed = now - lastActivityRef.current;
    if (idleElapsed < idleAfterMsRef.current) {
      accumulatedRef.current += Math.min(elapsed, idleAfterMsRef.current);
    } else {
      accumulatedRef.current += idleAfterMsRef.current;
    }
    segmentStartRef.current = now;
    lastActivityRef.current = now;
    setActiveMs(accumulatedRef.current);
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    segmentStartRef.current = Date.now();
    lastActivityRef.current = Date.now();
    setActiveMs(0);
  }, []);

  const snapshot = useCallback(() => activeMs, [activeMs]);

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
        const elapsed = now - segmentStartRef.current;
        const idleElapsed = now - lastActivityRef.current;
        if (idleElapsed < idleAfterMsRef.current) {
          accumulatedRef.current += Math.min(elapsed, idleAfterMsRef.current);
        } else {
          accumulatedRef.current += idleAfterMsRef.current;
        }
        hiddenRef.current = true;
      } else {
        segmentStartRef.current = Date.now();
        lastActivityRef.current = Date.now();
        hiddenRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [running]);
  return { activeMs, markActivity, reset, snapshot };
}
