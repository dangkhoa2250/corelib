export const PDF_TILE_CACHE_LIMIT_BYTES = 64 * 1024 * 1024;

export interface PdfTileCacheStats {
  bytes: number;
  peakBytes: number;
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface PdfTileCacheBudget {
  insert(entry: { key: string; bytes: number }): boolean;
  has(key: string): boolean;
  hit(key: string): boolean;
  touch(key: string): void;
  pin(key: string): void;
  unpin(key: string): void;
  remove(key: string): void;
  removeNamespace(prefix: string): void;
  subscribe(listener: (removedKeys: string[]) => void): () => void;
  stats(): PdfTileCacheStats;
}

interface TileBudgetEntry {
  bytes: number;
  lastAccess: number;
  pins: number;
}

export function createPdfTileCacheBudget(limitBytes = PDF_TILE_CACHE_LIMIT_BYTES): PdfTileCacheBudget {
  const limit = Math.max(0, limitBytes);
  const entries = new Map<string, TileBudgetEntry>();
  const listeners = new Set<(removedKeys: string[]) => void>();
  let accessClock = 0;
  let bytes = 0;
  let peakBytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const notify = (removedKeys: string[]) => {
    if (removedKeys.length === 0) return;
    listeners.forEach((listener) => listener(removedKeys));
  };

  const removeEntries = (keys: string[], countAsEviction: boolean) => {
    const removed: string[] = [];
    keys.forEach((key) => {
      const entry = entries.get(key);
      if (!entry) return;
      entries.delete(key);
      bytes -= entry.bytes;
      removed.push(key);
      if (countAsEviction) evictions += 1;
    });
    notify(removed);
  };

  const makeRoom = (requiredBytes: number, protectedKey?: string) => {
    const removed: string[] = [];
    while (bytes + requiredBytes > limit) {
      let candidateKey: string | null = null;
      let candidateAccess = Number.POSITIVE_INFINITY;
      entries.forEach((entry, key) => {
        if (key === protectedKey || entry.pins > 0 || entry.lastAccess >= candidateAccess) return;
        candidateKey = key;
        candidateAccess = entry.lastAccess;
      });
      if (candidateKey === null) break;
      const candidate = entries.get(candidateKey)!;
      entries.delete(candidateKey);
      bytes -= candidate.bytes;
      evictions += 1;
      removed.push(candidateKey);
    }
    notify(removed);
    return bytes + requiredBytes <= limit;
  };

  return {
    insert({ key, bytes: entryBytes }) {
      const normalizedBytes = Math.max(0, Math.floor(entryBytes));
      const existing = entries.get(key);
      if (existing && existing.bytes === normalizedBytes) {
        existing.lastAccess = ++accessClock;
        return true;
      }

      const previousBytes = existing?.bytes ?? 0;
      bytes -= previousBytes;
      if (!makeRoom(normalizedBytes, key)) {
        bytes += previousBytes;
        return false;
      }

      entries.set(key, {
        bytes: normalizedBytes,
        lastAccess: ++accessClock,
        pins: existing?.pins ?? 0,
      });
      bytes += normalizedBytes;
      peakBytes = Math.max(peakBytes, bytes);
      return true;
    },

    has(key) {
      return entries.has(key);
    },

    hit(key) {
      const entry = entries.get(key);
      if (!entry) {
        misses += 1;
        return false;
      }
      hits += 1;
      entry.lastAccess = ++accessClock;
      return true;
    },

    touch(key) {
      const entry = entries.get(key);
      if (entry) entry.lastAccess = ++accessClock;
    },

    pin(key) {
      const entry = entries.get(key);
      if (entry) entry.pins += 1;
    },

    unpin(key) {
      const entry = entries.get(key);
      if (entry) entry.pins = Math.max(0, entry.pins - 1);
    },

    remove(key) {
      removeEntries([key], false);
    },

    removeNamespace(prefix) {
      removeEntries([...entries.keys()].filter((key) => key.startsWith(prefix)), false);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    stats() {
      return {
        bytes,
        peakBytes,
        entries: entries.size,
        hits,
        misses,
        evictions,
      };
    },
  };
}

export const pdfTileCacheBudget = createPdfTileCacheBudget();
