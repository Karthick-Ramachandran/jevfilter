/**
 * Two-level answer cache for the demo Worker (ADR-0010): memory per isolate, then Workers KV
 * shared by every isolate. Plugs into jevfilter's `withCache` through the plain `CacheStore`
 * interface; the library itself doesn't know about KV.
 */
import { memoryCache, type CacheStore, type ProviderResponse } from "../../src/index.ts";

/** The part of KVNamespace this adapter uses, so tests can pass a fake. */
export interface KvLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** KV rejects an expirationTtl below 60 seconds. */
export const KV_MIN_TTL_SECONDS = 60;
const PREFIX = "jf:answers:v1:";

/**
 * Writes started during a request. The Worker passes them to `ctx.waitUntil` before returning,
 * so the runtime doesn't cancel a KV write once the response is sent.
 */
export const pendingWrites = new Set<Promise<unknown>>();

function track(p: Promise<unknown>): void {
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p)).catch(() => {});
}

/** A cached value is only used if it looks like provider answers. Anything else is a miss. */
function asAnswers(v: unknown): ProviderResponse | undefined {
  if (!v || typeof v !== "object") return undefined;
  const answers = (v as { answers?: unknown }).answers;
  return answers && typeof answers === "object" ? (v as ProviderResponse) : undefined;
}

/** Workers KV as a jevfilter `CacheStore`. `kv()` returns the binding for the current request. */
export function kvStore(kv: () => KvLike | undefined): CacheStore {
  return {
    async get(key) {
      const ns = kv();
      if (!ns) return undefined;
      return asAnswers(await ns.get(PREFIX + key, "json"));
    },
    set(key, value, ttlMs) {
      const ns = kv();
      if (!ns) return;
      const expirationTtl = Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlMs / 1000));
      track(ns.put(PREFIX + key, JSON.stringify(value), { expirationTtl }));
    },
  };
}

/** Memory first, then the shared store. Shared hits are copied into memory for this isolate. */
export function tieredStore(shared: CacheStore, local: CacheStore = memoryCache({ maxEntries: 1000 }), localTtlMs = 60_000): CacheStore {
  return {
    async get(key) {
      const hit = await local.get(key);
      if (hit) return hit;
      let fromShared: ProviderResponse | undefined;
      try {
        fromShared = await shared.get(key);
      } catch {
        return undefined; // a failing shared store is a miss, never an error
      }
      if (fromShared) local.set(key, fromShared, localTtlMs);
      return fromShared;
    },
    set(key, value, ttlMs) {
      local.set(key, value, ttlMs);
      try {
        const r = shared.set(key, value, ttlMs);
        if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
      } catch {
        // ignore: the memory level already has it
      }
    },
  };
}
