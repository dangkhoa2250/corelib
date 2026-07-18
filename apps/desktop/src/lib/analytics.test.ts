import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnalyticsClient } from "./analytics";
import type { AccountApi } from "../domain/account";

describe("AnalyticsClient", () => {
  let mockApi: AccountApi;
  const localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    // Mock localStorage
    Object.keys(localStorageMock).forEach((k) => delete localStorageMock[k]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageMock[key] || null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
    });

    mockApi = {
      register: vi.fn(),
      signIn: vi.fn(),
      currentSession: vi.fn(),
      signOut: vi.fn(),
      setAnalyticsEnabled: vi.fn(),
      sendAnalytics: vi.fn(),
      adminListUsers: vi.fn(),
      adminSetStatus: vi.fn(),
      adminSetGroups: vi.fn(),
      adminListGroups: vi.fn(),
      adminCreateGroup: vi.fn(),
      adminListFeatures: vi.fn(),
      adminCreateFeature: vi.fn(),
      adminSetFeatureAssignment: vi.fn(),
      adminMetrics: vi.fn(),
      adminDeleteUser: vi.fn(),
      upsertDailyStatistics: vi.fn(),
      adminStatistics: vi.fn(),
    };
  });

  it("does not enqueue when analytics is disabled", async () => {
    const client = new AnalyticsClient(mockApi, false);
    await client.track("app_opened", { someKey: "value" });
    
    expect(localStorageMock["library.analytics.queue.v1"]).toBeUndefined();
  });

  it("drops the oldest item after 100 queued events", async () => {
    const client = new AnalyticsClient(mockApi, true);
    for (let i = 1; i <= 105; i++) {
      await client.track("app_opened", { index: i });
    }

    const queueStr = localStorageMock["library.analytics.queue.v1"];
    expect(queueStr).toBeDefined();
    const queue = JSON.parse(queueStr);
    expect(queue.length).toBe(100);
    // The first 5 events (index 1 to 5) should be dropped
    expect(queue[0].properties.index).toBe(6);
    expect(queue[99].properties.index).toBe(105);
  });

  it("redacts prohibited payload keys before enqueue", async () => {
    const client = new AnalyticsClient(mockApi, true);
    await client.track("feature_opened", {
      featureKey: "reader",
      path: "/documents/123",
      content: "secret content",
      query: "vietnamese",
      token: "secret-token",
      documentId: "doc-1",
      cardId: "card-2",
      safeKey: "safeValue",
    });

    const queue = JSON.parse(localStorageMock["library.analytics.queue.v1"]);
    expect(queue[0].properties.featureKey).toBe("reader");
    expect(queue[0].properties.safeKey).toBe("safeValue");
    expect(queue[0].properties.path).toBeUndefined();
    expect(queue[0].properties.content).toBeUndefined();
    expect(queue[0].properties.query).toBeUndefined();
    expect(queue[0].properties.token).toBeUndefined();
    expect(queue[0].properties.documentId).toBeUndefined();
    expect(queue[0].properties.cardId).toBeUndefined();
  });

  it("keeps events when transport fails and clears them after a successful batch", async () => {
    const client = new AnalyticsClient(mockApi, true);
    
    // Enqueue event
    await client.track("app_opened", { id: 1 });

    // Mock sendAnalytics failing
    vi.mocked(mockApi.sendAnalytics).mockRejectedValueOnce(new Error("Network error"));
    await client.flush();

    // Verify it stays in the queue
    let queue = JSON.parse(localStorageMock["library.analytics.queue.v1"]);
    expect(queue.length).toBe(1);

    // Mock sendAnalytics succeeding
    vi.mocked(mockApi.sendAnalytics).mockResolvedValueOnce();
    await client.flush();

    // Verify queue is cleared
    queue = JSON.parse(localStorageMock["library.analytics.queue.v1"]);
    expect(queue.length).toBe(0);
  });
});
