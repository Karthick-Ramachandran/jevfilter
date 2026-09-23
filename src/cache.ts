/**
 * Provider answer cache (ADR-0008). Only the model's answers are cached. authorize, validation,
 * entity resolution and your executor still run on every call, so a cache hit can't skip security.
 */
import type { FilterProvider, ProviderRequest, ProviderResponse } from "./provider.ts";

export interface CacheStore {
  get(key: string): Promise<ProviderResponse | undefined> | ProviderResponse | undefined;
  set(key: string, value: ProviderResponse, ttlMs: number): Promise<void> | void;
}

export type CacheOptions<Ctx> = {
  store: CacheStore;
  /** How long an answer stays valid. Default 10 minutes. */
  ttlMs?: number;
} & (
  | {
      /** Partition the cache, usually by tenant: `(ctx) => ctx.tenantId`. */
      scope: (context: Ctx) => string;
      shared?: never;
    }
  | {
      /** Public data only: one cache for everyone. */
      shared: true;
      scope?: never;
    }
);

/** In-process LRU cache. Good for a single server or a Worker isolate. */
export function memoryCache(options: { maxEntries?: number } = {}): CacheStore {
  const max = options.maxEntries ?? 500;
  const map = new Map<string, { value: ProviderResponse; expires: number }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.expires <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      // Refresh recency.
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },
    set(key, value, ttlMs) {
      map.delete(key);
      map.set(key, { value, expires: Date.now() + ttlMs });
      while (map.size > max) map.delete(map.keys().next().value!);
    },
  };
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A response is cacheable only if every question got one of its offered options. */
function complete(request: ProviderRequest, response: ProviderResponse): boolean {
  if (!response || typeof response !== "object" || !response.answers) return false;
  return Object.entries(request.questions).every(([id, q]) => {
    const choice = response.answers[id]?.choice;
    return typeof choice === "string" && Object.prototype.hasOwnProperty.call(q.options, choice);
  });
}

/**
 * Wrap a provider with an answer cache. Scope is required: pass `scope` (per tenant) or
 * `shared: true` (public data). Identical concurrent requests share one provider call.
 */
export function withCache<Ctx>(provider: FilterProvider<Ctx>, options: CacheOptions<Ctx>): FilterProvider<Ctx> {
  const { store } = options;
  if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
    throw new TypeError("withCache needs a store with get and set");
  }
  if (typeof options.scope !== "function" && options.shared !== true) {
    throw new TypeError("withCache needs `scope: (context) => string`, or `shared: true` if the data is public");
  }
  const ttlMs = options.ttlMs ?? 10 * 60_000;
  const inflight = new Map<string, Promise<ProviderResponse>>();

  return {
    name: provider.name,
    ...(provider.model ? { model: provider.model } : {}),
    async choose(request, callOptions) {
      const scope = options.shared === true ? "shared" : String(options.scope!(callOptions.context));
      const key = await sha256(
        JSON.stringify({ p: provider.name, m: provider.model ?? null, s: scope, st: request.state, q: request.questions }),
      );

      let cached: ProviderResponse | undefined;
      try {
        cached = await store.get(key);
      } catch {
        cached = undefined; // A broken cache must never break search.
      }
      if (cached && complete(request, cached)) {
        return { ...cached, usage: { inputTokens: 0, outputTokens: 0 }, cached: true };
      }

      const pending = inflight.get(key);
      // Someone else is already asking the same question: share their answer, spend nothing.
      if (pending) return { ...(await pending), usage: { inputTokens: 0, outputTokens: 0 }, cached: true };

      const call = provider.choose(request, callOptions);
      inflight.set(key, call);
      try {
        const response = await call;
        if (complete(request, response)) {
          try {
            await store.set(key, { answers: response.answers, ...(response.model ? { model: response.model } : {}) }, ttlMs);
          } catch {
            // Ignore cache write failures.
          }
        }
        return response;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
