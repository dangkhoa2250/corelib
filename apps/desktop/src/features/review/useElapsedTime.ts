import { useEffect, useState } from "react";

export function useElapsedTime(startedAt: number, running = true): number {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  return Math.max(0, now - startedAt);
}
