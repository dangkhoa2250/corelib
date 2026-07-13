import { expect, it } from "vitest";

import { createPageRenderQueue } from "./pageRenderQueue";

const flushQueue = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it("runs one page raster at a time and drops a superseded queued raster", async () => {
  const queue = createPageRenderQueue({ concurrency: 1 });
  let releaseFirst!: () => void;
  let secondStarted = false;

  const first = queue.run(() => new Promise<void>((resolve) => {
    releaseFirst = resolve;
  }), { priority: 0 });
  const second = queue.run(() => {
    secondStarted = true;
    return Promise.resolve();
  }, { priority: 0 });

  await flushQueue();
  expect(secondStarted).toBe(false);

  queue.supersede(second.id);
  await expect(second.promise).rejects.toMatchObject({ code: "SUPERSEDED" });

  releaseFirst();
  await first.promise;
});

it("starts a visible page raster before lower-priority queued work", async () => {
  const queue = createPageRenderQueue({ concurrency: 1 });
  let releaseBlocker!: () => void;
  const order: string[] = [];

  const blocker = queue.run(() => new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  }), { priority: 0 });
  const low = queue.run(() => {
    order.push("low");
    return Promise.resolve();
  }, { priority: 0 });
  const visible = queue.run(() => {
    order.push("visible");
    return Promise.resolve();
  }, { priority: 10 });

  await flushQueue();
  releaseBlocker();
  await blocker.promise;
  await visible.promise;
  await low.promise;

  expect(order).toEqual(["visible", "low"]);
});
