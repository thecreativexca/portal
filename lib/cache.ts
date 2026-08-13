/**
 * Minimal in-memory TTL cache.
 *
 * Used to stop the heavy CEO-dashboard aggregations from re-running on every
 * request. Keyed by companyId so tenant isolation is preserved. Single-instance
 * only (matches lib/rateLimit.ts); documented in docs/DEPLOYMENT.md.
 *
 * `cached(key, ttlSeconds, fn)` is promise-safe: concurrent callers for the same
 * key share one in-flight computation.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  pending?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();

let lastPrune = Date.now();
function prune(now: number) {
  if (now - lastPrune < 30_000) return;
  lastPrune = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  prune(now);

  const existing = store.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now && "value" in existing) {
    return existing.value;
  }
  if (existing?.pending) {
    return existing.pending;
  }

  const entry: Entry<T> = {
    value: undefined as unknown as T,
    expiresAt: now + ttlSeconds * 1000,
  };
  store.set(key, entry);

  entry.pending = fn().then(
    (value) => {
      entry.value = value;
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      delete entry.pending;
      return value;
    },
    (error) => {
      // Don't cache failures; drop the entry so the next call retries.
      store.delete(key);
      throw error;
    }
  );

  return entry.pending;
}

/** Drop a cache key (call after mutations that affect the cached data). */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/** Drop every cached entry for a given company (e.g. settings changed). */
export function invalidateCompany(companyId: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(companyId + ":")) store.delete(key);
  }
}
