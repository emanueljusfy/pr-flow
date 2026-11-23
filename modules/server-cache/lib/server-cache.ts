/**
 * In-memory stale-while-revalidate cache for calls to external services
 * (gh CLI, Google Calendar, Open-Meteo, docker compose...).
 *
 * - fresh (age < ttlMs): returns the cached value, no call.
 * - stale (ttlMs <= age < staleTtlMs): returns the cached value right away and
 *   refreshes in the background.
 * - missing or older than staleTtlMs: waits for the fetcher.
 * - Concurrent misses for the same key share one in-flight call.
 * - A failing fetcher falls back to the cached value (if any, within staleTtlMs).
 *
 * Stores live on globalThis so Next.js dev HMR does not drop them.
 */

export type ServerCacheOptions<T> = {
  /** Unique name; also scopes the store on globalThis. */
  name: string;
  ttlMs: number;
  /** Defaults to ttlMs (no stale serving). */
  staleTtlMs?: number;
  /** Oldest entries are evicted past this size. Default 200. */
  maxEntries?: number;
  /** Return false to pass a value through without caching it (e.g. error results). */
  shouldCache?: (value: T) => boolean;
  now?: () => number;
};

type Entry<T> = { value: T; storedAt: number };

type Store<T> = {
  entries: Map<string, Entry<T>>;
  inFlight: Map<string, Promise<T>>;
};

export type ServerCache<T> = {
  get(key: string, fetcher: () => Promise<T>): Promise<T>;
  /** Cached value regardless of age (within staleTtlMs), without calling anything. */
  peek(key: string): T | undefined;
  invalidate(key: string): void;
  clear(): void;
};

const GLOBAL_KEY = Symbol.for("pr-flow.server-cache.stores");

function storeFor<T>(name: string): Store<T> {
  const globalScope = globalThis as unknown as Record<symbol, Map<string, Store<unknown>> | undefined>;
  const stores = (globalScope[GLOBAL_KEY] ??= new Map());
  let store = stores.get(name);
  if (!store) {
    store = { entries: new Map(), inFlight: new Map() };
    stores.set(name, store);
  }
  return store as Store<T>;
}

export function createServerCache<T>(options: ServerCacheOptions<T>): ServerCache<T> {
  const ttlMs = options.ttlMs;
  const staleTtlMs = Math.max(options.staleTtlMs ?? ttlMs, ttlMs);
  const maxEntries = options.maxEntries ?? 200;
  const shouldCache = options.shouldCache ?? (() => true);
  const now = options.now ?? Date.now;
  const store = storeFor<T>(options.name);

  function usable(key: string): Entry<T> | undefined {
    const entry = store.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (now() - entry.storedAt >= staleTtlMs) {
      store.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function write(key: string, value: T): void {
    store.entries.delete(key);
    store.entries.set(key, { value, storedAt: now() });
    while (store.entries.size > maxEntries) {
      const oldest = store.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      store.entries.delete(oldest);
    }
  }

  function refresh(key: string, fetcher: () => Promise<T>): Promise<T> {
    const running = store.inFlight.get(key);
    if (running) {
      return running;
    }

    const promise = (async () => {
      try {
        const value = await fetcher();
        if (shouldCache(value)) {
          write(key, value);
        }
        return value;
      } catch (error) {
        const fallback = usable(key);
        if (fallback) {
          return fallback.value;
        }
        throw error;
      } finally {
        store.inFlight.delete(key);
      }
    })();

    store.inFlight.set(key, promise);
    return promise;
  }

  return {
    async get(key, fetcher) {
      const entry = usable(key);
      if (!entry) {
        return refresh(key, fetcher);
      }
      if (now() - entry.storedAt >= ttlMs) {
        // Errors are already folded into the stale fallback inside refresh().
        void refresh(key, fetcher).catch(() => undefined);
      }
      return entry.value;
    },
    peek(key) {
      return usable(key)?.value;
    },
    invalidate(key) {
      store.entries.delete(key);
    },
    clear() {
      store.entries.clear();
      store.inFlight.clear();
    }
  };
}

/**
 * Shares one in-flight call among concurrent callers (no caching of results).
 * Keyed on globalThis so crons (instrumentation bundle) and route handlers join
 * the same call.
 */
export function createSingleFlight<T>(name: string, fn: () => Promise<T>): () => Promise<T> {
  const store = storeFor<T>(`single-flight:${name}`);
  return () => {
    const running = store.inFlight.get(name);
    if (running) {
      return running;
    }
    const promise = fn().finally(() => {
      store.inFlight.delete(name);
    });
    store.inFlight.set(name, promise);
    return promise;
  };
}
