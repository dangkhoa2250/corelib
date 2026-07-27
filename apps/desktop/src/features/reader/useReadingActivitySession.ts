import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveTimer, type ActiveTimer } from "../statistics/useActiveTimer";
import type { ActivityCheckpointInput, StartActivitySessionInput } from "../../domain/statistics";

export interface StatisticsActivityApi {
  start(input: StartActivitySessionInput): Promise<void>;
  checkpoint(input: ActivityCheckpointInput): Promise<void>;
  finish(sessionId: string, occurredAt: string): Promise<void>;
}

interface CheckpointIntent {
  snapshotMs: number;
  page: number;
  pageVisitIncrement: number;
}

function getLocalDay(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().split("T")[0];
}

export function useReadingActivitySession(
  documentId: string,
  primaryPage: number,
  api: StatisticsActivityApi,
) {
  const timer = useActiveTimer();
  const timerRef = useRef<ActiveTimer>(timer);
  timerRef.current = timer;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startInputRef = useRef<StartActivitySessionInput | null>(null);
  const startInFlightRef = useRef<Promise<boolean> | null>(null);
  const remoteStartedRef = useRef(false);
  const startedRef = useRef(false);
  const lastCheckpointedTimeRef = useRef(0);
  const lastEnqueuedPageRef = useRef(primaryPage);
  const queueRef = useRef<CheckpointIntent[]>([]);
  const drainingRef = useRef<Promise<boolean> | null>(null);
  const primaryPageRef = useRef(primaryPage);
  primaryPageRef.current = primaryPage;
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const apiRef = useRef(api);
  apiRef.current = api;

  const ensureStarted = useCallback((): Promise<boolean> => {
    if (remoteStartedRef.current) return Promise.resolve(true);
    if (startInFlightRef.current) return startInFlightRef.current;
    const input = startInputRef.current;
    if (!input) return Promise.resolve(false);
    const request = apiRef.current
      .start(input)
      .then(() => {
        remoteStartedRef.current = true;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        startInFlightRef.current = null;
      });
    startInFlightRef.current = request;
    return request;
  }, []);

  const drainQueue = useCallback((): Promise<boolean> => {
    if (drainingRef.current) return drainingRef.current;
    const request = (async () => {
      if (!(await ensureStarted())) return false;
      while (queueRef.current.length > 0) {
        const intent = queueRef.current[0];
        const id = sessionIdRef.current;
        if (!id) return false;
        const activeMs = Math.max(0, intent.snapshotMs - lastCheckpointedTimeRef.current);
        try {
          await apiRef.current.checkpoint({
            sessionId: id,
            occurredAt: new Date().toISOString(),
            activeMs,
            documentId: documentIdRef.current,
            page: intent.page,
            pageVisitIncrement: intent.pageVisitIncrement,
          });
        } catch {
          return false;
        }
        lastCheckpointedTimeRef.current = Math.max(
          lastCheckpointedTimeRef.current,
          intent.snapshotMs,
        );
        queueRef.current.shift();
      }
      return true;
    })().finally(() => {
      drainingRef.current = null;
    });
    drainingRef.current = request;
    return request;
  }, [ensureStarted]);

  const enqueuePeriodicCheckpoint = useCallback((snapshotMs: number, page: number) => {
    const last = queueRef.current[queueRef.current.length - 1];
    if (last && last.page === page && last.pageVisitIncrement === 0) {
      last.snapshotMs = Math.max(last.snapshotMs, snapshotMs);
    } else {
      queueRef.current.push({ snapshotMs, page, pageVisitIncrement: 0 });
    }
    void drainQueue();
  }, [drainQueue]);

  useEffect(() => {
    if (startedRef.current || timer.activeMs <= 0) return;
    startedRef.current = true;
    const id = crypto.randomUUID();
    const now = new Date();
    const input: StartActivitySessionInput = {
      id,
      appKey: "reading",
      activityKind: "reading",
      contextKind: "document",
      contextId: documentId,
      occurredAt: now.toISOString(),
      localDay: getLocalDay(),
      timezoneOffsetMinutes: -now.getTimezoneOffset(),
    };
    sessionIdRef.current = id;
    startInputRef.current = input;
    lastCheckpointedTimeRef.current = 0;
    lastEnqueuedPageRef.current = primaryPage;
    queueRef.current = [{
      snapshotMs: timerRef.current.snapshot(),
      page: primaryPage,
      pageVisitIncrement: 0,
    }];
    setSessionId(id);
    void drainQueue();
  }, [timer.activeMs, documentId, primaryPage, drainQueue]);

  useEffect(() => {
    if (!sessionId || primaryPage === lastEnqueuedPageRef.current) return;
    const snapshotMs = timerRef.current.snapshot();
    const previousPage = lastEnqueuedPageRef.current;
    queueRef.current.push(
      { snapshotMs, page: previousPage, pageVisitIncrement: 0 },
      { snapshotMs, page: primaryPage, pageVisitIncrement: 1 },
    );
    lastEnqueuedPageRef.current = primaryPage;
    void drainQueue();
  }, [primaryPage, sessionId, drainQueue]);

  useEffect(() => {
    if (!sessionId) return;
    const interval = window.setInterval(() => {
      enqueuePeriodicCheckpoint(
        timerRef.current.snapshot(),
        primaryPageRef.current,
      );
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [sessionId, enqueuePeriodicCheckpoint]);

  useEffect(() => {
    return () => {
      const id = sessionIdRef.current;
      if (!id) return;
      enqueuePeriodicCheckpoint(timerRef.current.snapshot(), primaryPageRef.current);
      void drainQueue()
        .catch(() => false)
        .then(() => apiRef.current.finish(id, new Date().toISOString()))
        .catch(() => {});
    };
  }, [drainQueue, enqueuePeriodicCheckpoint]);
}
