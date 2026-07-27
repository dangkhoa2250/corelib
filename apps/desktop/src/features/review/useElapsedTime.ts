import { useEffect } from "react";
import { useActiveTimer } from "../statistics/useActiveTimer";

export function useElapsedTime(startedAt: number, running = true): number {
  const timer = useActiveTimer({ running });

  useEffect(() => {
    timer.reset();
  }, [startedAt]);

  return timer.activeMs;
}
