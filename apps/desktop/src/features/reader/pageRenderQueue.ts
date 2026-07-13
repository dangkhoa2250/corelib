export class PageRenderQueueError extends Error {
  constructor(readonly code: "SUPERSEDED") {
    super("Page render job was superseded before it started");
  }
}

interface PageRenderQueueJob {
  id: number;
  priority: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export interface PageRenderQueueToken<T> {
  id: number;
  promise: Promise<T>;
}

export function createPageRenderQueue({ concurrency }: { concurrency: number }) {
  const limit = Math.max(1, concurrency);
  let active = 0;
  let nextId = 1;
  const pending: PageRenderQueueJob[] = [];

  const drain = () => {
    while (active < limit && pending.length > 0) {
      pending.sort((left, right) => right.priority - left.priority);
      const job = pending.shift()!;
      active += 1;
      void job.run().then(job.resolve, job.reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  };

  return {
    run<T>(task: () => Promise<T>, { priority }: { priority: number }): PageRenderQueueToken<T> {
      const id = nextId++;
      const promise = new Promise<T>((resolve, reject) => {
        pending.push({
          id,
          priority,
          run: task as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
      });
      queueMicrotask(drain);
      return { id, promise };
    },

    supersede(id: number) {
      const index = pending.findIndex((job) => job.id === id);
      if (index === -1) return;
      const [job] = pending.splice(index, 1);
      job.reject(new PageRenderQueueError("SUPERSEDED"));
    },
  };
}
