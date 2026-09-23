/**
 * Provider answer cache (ADR-0008). Only the model's answers are cached. authorize, validation,
 * entity resolution and your executor still run on every call, so a cache hit can't skip security.
 *
 * Failure rules:
 * - A store that throws or hangs counts as a miss on read and is ignored on write. It never fails
 *   a search, and a read never delays one by more than `storeTimeoutMs`.
 * - A shared in-flight call is only as good as its answer. If it fails, is abandoned, or returns
 *   an incomplete answer, a waiting caller takes over as the new leader instead of inheriting it.
 */
import type { FilterProvider, ProviderRequest, ProviderResponse } from "./provider.ts";

export interface CacheStore {
  get(key: string): Promise<ProviderResponse | undefined> | ProviderResponse | undefined;
  set(key: string, value: ProviderResponse, ttlMs: number): Promise<void> | void;
}

export type CacheOptions<Ctx> = {
  store: CacheStore;
  /** How long an answer stays valid, in ms. Default 10 minutes. */
  ttlMs?: number;
  /** Longest a store read may take before it counts as a miss, in ms. Default 250. */
  storeTimeoutMs?: number;
} & (
  | {
      /** Partition the cache, usually by tenant: `(ctx) => ctx.tenantId`. Must return a non-empty string. */
      scope: (context: Ctx) => string;
      shared?: never;
    }
  | {
      /** Public data only: one cache for everyone. */
      shared: true;
      scope?: never;
    }
);

function checkNumber(name: string, value: unknown, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new TypeError(`${name} must be a finite number of at least ${min}`);
  }
  return value;
}

/**
 * In-process LRU cache. Good for a single server or a Worker isolate.
 * `ttlMs` optionally caps how long any entry may live, whatever `withCache` asks for.
 */
export function memoryCache(options: { maxEntries?: number; ttlMs?: number } = {}): CacheStore {
  const max = Math.floor(checkNumber("memoryCache maxEntries", options.maxEntries ?? 500, 1));
  const cap = options.ttlMs === undefined ? Infinity : checkNumber("memoryCache ttlMs", options.ttlMs, 1);
  const map = new Map<string, { value: ProviderResponse; expires: number }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (!(hit.expires > Date.now())) {
        map.delete(key);
        return undefined;
      }
      // Refresh recency.
      map.delete(key);
      map.set(key, hit);
      return structuredClone(hit.value);
    },
    set(key, value, ttlMs) {
      const ttl = Math.min(Number(ttlMs), cap);
      if (!(ttl > 0)) return; // NaN, zero or negative: don't store.
      map.delete(key);
      map.set(key, { value: structuredClone(value), expires: Date.now() + ttl });
      while (map.size > max) map.delete(map.keys().next().value!);
    },
  };
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A response is usable only if every question got one of its offered options. */
function complete(request: ProviderRequest, response: ProviderResponse | undefined): response is ProviderResponse {
  if (!response || typeof response !== "object" || !response.answers || typeof response.answers !== "object") return false;
  return Object.entries(request.questions).every(([id, q]) => {
    const choice = response.answers[id]?.choice;
    return typeof choice === "string" && Object.prototype.hasOwnProperty.call(q.options, choice);
  });
}

/** Settle with `p`, or reject as soon as `signal` aborts. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** The stored value, or undefined if the store throws, hangs past `ms`, or the call aborts. */
function readStore(store: CacheStore, key: string, ms: number, signal: AbortSignal): Promise<ProviderResponse | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: ProviderResponse | undefined) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(v);
    };
    const onAbort = () => finish(undefined);
    const timer = setTimeout(() => finish(undefined), ms);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      Promise.resolve(store.get(key)).then(finish, () => finish(undefined));
    } catch {
      finish(undefined);
    }
  });
}

/** Fire-and-forget write: a failing or hanging store never affects the search. */
function writeStore(store: CacheStore, key: string, value: ProviderResponse, ttlMs: number): void {
  try {
    Promise.resolve(store.set(key, value, ttlMs)).catch(() => {});
  } catch {
    // Ignore synchronous store errors.
  }
}

const zeroUsage = () => ({ inputTokens: 0, outputTokens: 0 });

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
  const ttlMs = checkNumber("withCache ttlMs", options.ttlMs ?? 10 * 60_000, 1);
  const storeTimeoutMs = checkNumber("withCache storeTimeoutMs", options.storeTimeoutMs ?? 250, 1);
  // key → the leader's shared promise. It rejects if the leader's call fails or is abandoned.
  const inflight = new Map<string, Promise<ProviderResponse>>();

  function partition(context: Ctx): { mode: "shared" } | { mode: "scope"; scope: string } {
    if (options.shared === true) return { mode: "shared" };
    const scope = options.scope!(context);
    if (typeof scope !== "string" || scope.length === 0) {
      // Never coerce: String({}) or String(undefined) would merge unrelated tenants.
      throw new TypeError("withCache scope(context) must return a non-empty string");
    }
    return { mode: "scope", scope };
  }

  return {
    name: provider.name,
    ...(provider.model ? { model: provider.model } : {}),
    async choose(request, callOptions) {
      const { signal } = callOptions;
      const key = await sha256(
        JSON.stringify({ p: provider.name, m: provider.model ?? null, part: partition(callOptions.context), st: request.state, q: request.questions }),
      );

      const stored = await readStore(store, key, storeTimeoutMs, signal);
      if (complete(request, stored)) return { ...stored, usage: zeroUsage(), cached: true };

      // Join a call already in flight, or lead one. A failed round means the leader failed, was
      // abandoned, or answered badly; the next caller in line takes over.
      for (let round = 0; round < 3; round++) {
        const pending = inflight.get(key);
        if (pending) {
          try {
            const shared = await untilAborted(pending, signal);
            if (complete(request, shared)) return { ...structuredClone(shared), usage: zeroUsage(), cached: true };
          } catch (e) {
            if (signal.aborted) throw e; // our own deadline, not the leader's problem
          }
          continue;
        }

        // Lead. The shared promise settles with the provider call, or rejects if our own call is
        // abandoned (for example our deadline hits and the provider ignores the signal).
        const call = Promise.resolve().then(() => provider.choose(request, callOptions));
        const shared = untilAborted(call, signal);
        const release = () => {
          if (inflight.get(key) === shared) inflight.delete(key);
        };
        shared.then(release, release); // also marks the rejection as handled for followers
        inflight.set(key, shared);

        const response = await shared;
        if (complete(request, response)) {
          writeStore(store, key, structuredClone({ answers: response.answers, ...(response.model ? { model: response.model } : {}) }), ttlMs);
        }
        return response;
      }
      // Leaders kept failing: make one direct call rather than wait on more rounds.
      return provider.choose(request, callOptions);
    },
  };
}
