import { useEffect, useRef, useState } from "react";
import { useActiveTimer } from "../statistics/useActiveTimer";
import type { ActivityCheckpointInput, StartActivitySessionInput } from "../../domain/statistics";

export interface StatisticsActivityApi {
  start(input: StartActivitySessionInput): Promise<void>;
  checkpoint(input: ActivityCheckpointInput): Promise<void>;
  finish(sessionId: string, occurredAt: string): Promise<void>;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const lastCheckpointedPageRef = useRef<number | null>(null);
  const lastCheckpointedTimeRef = useRef(0);
  const primaryPageRef = useRef(primaryPage);
  primaryPageRef.current = primaryPage;
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (startedRef.current || timer.activeMs <= 0) return;
    startedRef.current = true;
    lastCheckpointedPageRef.current = primaryPage;
    lastCheckpointedTimeRef.current = timer.snapshot();
    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    setSessionId(id);
    const now = new Date();
    api.start({
      id,
      appKey: "reading",
      activityKind: "reading",
      contextKind: "document",
      contextId: documentId,
      occurredAt: now.toISOString(),
      localDay: getLocalDay(),
      timezoneOffsetMinutes: -now.getTimezoneOffset(),
    }).catch(() => {});
  }, [timer.activeMs, documentId, api, primaryPage]);

  useEffect(() => {
    if (!sessionId) return;
    const id = sessionId;
    const nowMs = timer.snapshot();
    const increment = primaryPage !== lastCheckpointedPageRef.current ? 1 : 0;
    api.checkpoint({
      sessionId: id,
      occurredAt: new Date().toISOString(),
      activeMs: nowMs - lastCheckpointedTimeRef.current,
      documentId,
      page: primaryPage,
      pageVisitIncrement: increment,
    }).catch(() => {});
    lastCheckpointedPageRef.current = primaryPage;
    lastCheckpointedTimeRef.current = nowMs;
  }, [primaryPage, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId) return;
    const id = sessionId;
    const interval = setInterval(() => {
      const nowMs = timer.snapshot();
      const currentPage = primaryPageRef.current;
      const increment = currentPage !== lastCheckpointedPageRef.current ? 1 : 0;
      apiRef.current.checkpoint({
        sessionId: id,
        occurredAt: new Date().toISOString(),
        activeMs: nowMs - lastCheckpointedTimeRef.current,
        documentId: documentIdRef.current,
        page: currentPage,
        pageVisitIncrement: increment,
      }).catch(() => {});
      lastCheckpointedPageRef.current = currentPage;
      lastCheckpointedTimeRef.current = nowMs;
    }, 15_000);
    return () => clearInterval(interval);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      const sid = sessionIdRef.current;
      if (sid) {
        apiRef.current.finish(sid, new Date().toISOString()).catch(() => {});
      }
    };
  }, []);
}
