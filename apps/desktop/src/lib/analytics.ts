import type { AccountApi, AnalyticsEventInput } from "../domain/account";

const QUEUE_KEY = "library.analytics.queue.v1";
const INSTALLATION_ID_KEY = "library.analytics.installation-id.v1";
const MAX_QUEUE_SIZE = 100;
const FLUSH_INTERVAL_MS = 60_000;

const PROHIBITED_KEYS = new Set([
  "path",
  "content",
  "query",
  "prompt",
  "location",
  "address",
  "token",
  "documentId",
  "cardId",
  "secret",
  "password",
  "apiKey",
  "stack",
  "auth",
]);

type PayloadValue = string | number | boolean;
type Payload = Record<string, PayloadValue>;

interface QueuedEvent {
  name: string;
  properties: Payload;
  occurredAt: string;
}

function isPayloadValue(value: unknown): value is PayloadValue {
  if (typeof value === "string") return value.length <= 160;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

function redactPayload(input: Record<string, unknown>): Payload {
  const safe: Payload = {};
  for (const key of Object.keys(input)) {
    if (key.length === 0 || key.length > 80) continue;
    if (PROHIBITED_KEYS.has(key)) continue;
    const value = input[key];
    if (!isPayloadValue(value)) continue;
    safe[key] = value;
  }
  return safe;
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      return localStorage;
    }
  } catch (_) {}
  return null;
}

function isQueuedEvent(value: unknown): value is QueuedEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.occurredAt === "string" &&
    typeof v.properties === "object" &&
    v.properties !== null
  );
}

function loadQueue(): QueuedEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedEvent);
  } catch (_) {
    return [];
  }
}

function saveQueue(queue: QueuedEvent[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (_) {}
}

function loadInstallationId(): string {
  const storage = getStorage();
  if (storage) {
    try {
      const existing = storage.getItem(INSTALLATION_ID_KEY);
      if (existing && existing.length <= 80) return existing;
    } catch (_) {}
  }
  let id = "unknown";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    }
  } catch (_) {}
  if (storage && id !== "unknown") {
    try {
      storage.setItem(INSTALLATION_ID_KEY, id);
    } catch (_) {}
  }
  return id;
}

export class AnalyticsClient {
  private queue: QueuedEvent[];
  private installationId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private api: AccountApi,
    private analyticsEnabled: boolean,
    private appVersion = "0.1.1",
  ) {
    this.queue = loadQueue();
    this.installationId = loadInstallationId();
  }

  setAnalyticsEnabled(enabled: boolean): void {
    this.analyticsEnabled = enabled;
  }

  isEnabled(): boolean {
    return this.analyticsEnabled;
  }

  track(name: string, payload: Record<string, unknown> = {}): void {
    if (!this.analyticsEnabled) return;
    const event: QueuedEvent = {
      name,
      properties: redactPayload(payload),
      occurredAt: new Date().toISOString(),
    };
    this.queue.push(event);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(this.queue.length - MAX_QUEUE_SIZE);
    }
    saveQueue(this.queue);
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue[0];
      const input: AnalyticsEventInput = {
        installationId: this.installationId,
        name: event.name,
        appVersion: this.appVersion,
        occurredAt: event.occurredAt,
        payload: event.properties,
      };
      try {
        await this.api.sendAnalytics(input);
      } catch (_) {
        break;
      }
      this.queue.shift();
      saveQueue(this.queue);
    }
  }

  startAutoFlush(): () => void {
    this.stopAutoFlush();
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    const onOnline = () => {
      void this.flush();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }
    return () => {
      this.stopAutoFlush();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    };
  }

  stopAutoFlush(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
