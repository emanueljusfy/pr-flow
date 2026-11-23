import { describe, expect, it, vi } from "vitest";
import { createServerCache, createSingleFlight } from "@/modules/server-cache/lib/server-cache";

function makeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

let cacheId = 0;
function uniqueName(): string {
  cacheId += 1;
  return `test-cache-${cacheId}`;
}

describe("createServerCache", () => {
  it("returns the cached value while fresh without calling the fetcher again", async () => {
    const clock = makeClock();
    const cache = createServerCache<number>({ name: uniqueName(), ttlMs: 1000, now: clock.now });
    const fetcher = vi.fn().mockResolvedValue(1);

    expect(await cache.get("k", fetcher)).toBe(1);
    clock.advance(999);
    expect(await cache.get("k", fetcher)).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves stale value immediately and refreshes in the background", async () => {
    const clock = makeClock();
    const cache = createServerCache<number>({
      name: uniqueName(),
      ttlMs: 1000,
      staleTtlMs: 10_000,
      now: clock.now
    });

    await cache.get("k", async () => 1);
    clock.advance(2000);

    let resolveRefresh: (value: number) => void = () => undefined;
    const slowFetcher = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveRefresh = resolve;
        })
    );

    expect(await cache.get("k", slowFetcher)).toBe(1);
    expect(slowFetcher).toHaveBeenCalledTimes(1);

    resolveRefresh(2);
    await vi.waitFor(() => expect(cache.peek("k")).toBe(2));
  });

  it("waits for the fetcher once the entry is older than staleTtlMs", async () => {
    const clock = makeClock();
    const cache = createServerCache<number>({
      name: uniqueName(),
      ttlMs: 1000,
      staleTtlMs: 5000,
      now: clock.now
    });

    await cache.get("k", async () => 1);
    clock.advance(5000);
    expect(await cache.get("k", async () => 2)).toBe(2);
  });

  it("shares one in-flight call between concurrent misses", async () => {
    const cache = createServerCache<number>({ name: uniqueName(), ttlMs: 1000 });
    const fetcher = vi.fn(async () => 7);

    const [a, b, c] = await Promise.all([
      cache.get("k", fetcher),
      cache.get("k", fetcher),
      cache.get("k", fetcher)
    ]);

    expect([a, b, c]).toEqual([7, 7, 7]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stale value when the refresh fails", async () => {
    const clock = makeClock();
    const cache = createServerCache<number>({
      name: uniqueName(),
      ttlMs: 1000,
      staleTtlMs: 10_000,
      now: clock.now
    });

    await cache.get("k", async () => 1);
    clock.advance(1500);
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });

    expect(await cache.get("k", failing)).toBe(1);
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    expect(cache.peek("k")).toBe(1);
  });

  it("rethrows when there is nothing cached to fall back on", async () => {
    const cache = createServerCache<number>({ name: uniqueName(), ttlMs: 1000 });
    await expect(
      cache.get("k", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("does not cache values rejected by shouldCache", async () => {
    const cache = createServerCache<{ ok: boolean }>({
      name: uniqueName(),
      ttlMs: 1000,
      shouldCache: (value) => value.ok
    });
    const fetcher = vi.fn(async () => ({ ok: false }));

    await cache.get("k", fetcher);
    await cache.get("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces the next get to call the fetcher", async () => {
    const cache = createServerCache<number>({ name: uniqueName(), ttlMs: 60_000 });
    await cache.get("k", async () => 1);
    cache.invalidate("k");
    expect(await cache.get("k", async () => 2)).toBe(2);
  });

  it("evicts the oldest entry past maxEntries", async () => {
    const cache = createServerCache<number>({ name: uniqueName(), ttlMs: 60_000, maxEntries: 2 });
    await cache.get("a", async () => 1);
    await cache.get("b", async () => 2);
    await cache.get("c", async () => 3);

    expect(cache.peek("a")).toBeUndefined();
    expect(cache.peek("b")).toBe(2);
    expect(cache.peek("c")).toBe(3);
  });

  it("keeps entries across instances created with the same name (HMR)", async () => {
    const name = uniqueName();
    await createServerCache<number>({ name, ttlMs: 60_000 }).get("k", async () => 1);
    expect(createServerCache<number>({ name, ttlMs: 60_000 }).peek("k")).toBe(1);
  });
});

describe("createSingleFlight", () => {
  it("joins concurrent callers and runs again after settling", async () => {
    const fn = vi.fn(async () => "done");
    const run = createSingleFlight(uniqueName(), fn);

    await Promise.all([run(), run()]);
    expect(fn).toHaveBeenCalledTimes(1);

    await run();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
