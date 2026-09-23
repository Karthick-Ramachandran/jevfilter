# ADR-0010: Demo Answer Cache In Workers KV And A 60 Per Minute Global Cap

## Status

Accepted

## Supersedes

- ADR-0009-serve-the-demo-on-cloudflare-pages-with-the-api-worker-behind-a-service-binding

## Context

Two changes to the hosted demo, both requested by the maintainer on 2026-09-23 ("raise the cap and
yes lets dig into this"):

1. A Show HN launch can bring hundreds of visitors at once. The 30 searches per minute global cap
   would show many of them "the shared demo key is busy".
2. The demo's answer cache was only `memoryCache`, which lives in one Worker isolate. Cloudflare runs
   many isolates, so a repeat search only hits the cache when it lands on an isolate that already saw
   it. No external store (Redis, KV) had been tested live.

## Decision

Everything in ADR-0009 stands: Pages serves the static site with the `_headers` CSP, and `/api/*`
goes through a Pages Function and a service binding to the `jevfilter` Worker. The Worker holds the
`TYPESAFE_API_KEY` secret, the kill switch, and all logic. The per-IP limit stays at 10 searches
per minute. Changes:

- **Global cap: 60 searches per minute** (was 30). Worst case if saturated for 24 hours:
  60 × 1,440 × about 2.3k–3k input tokens × $0.042/M, so roughly $8.3–11/day.
- **Two-level answer cache** in the demo Worker (`demo/src/kv-cache.ts`):
  - level 1 is `memoryCache` per isolate;
  - level 2 is a Workers KV namespace bound as `ANSWER_CACHE`, shared by all isolates.
  - Reads try memory, then KV, and copy KV hits into memory. Writes go to both.
- KV writes run inside `ctx.waitUntil`, so the runtime doesn't cancel them after the response is
  sent. KV entries use the cache TTL, raised to KV's 60-second minimum when shorter.
- What is stored: the provider's answers only (question ids, chosen labels, probabilities, model).
  The key is the library's SHA-256 of provider, model, scope, search text and questions. KV never
  holds the search text, records, or the key.
- A failing or slow KV degrades to the memory level or a miss. The library already bounds store reads
  (`storeTimeoutMs`) and ignores write failures.
- The library itself doesn't change. The KV adapter is demo code that shows how to plug in an
  external store through the existing `CacheStore` interface.

## Applies To

- demo/**

## Alternatives Considered

- Keep 30 per minute: cheaper, but a launch spike mostly sees "busy".
- Remove the global cap: spend would have no bound.
- Redis instead of KV: needs an external service and credentials. KV is native to Workers.
- Cloudflare's Cache API: it is per data center and less predictable for this use.

## Consequences

- Repeat searches hit the cache across isolates in the same location. Other locations see an entry
  within about 60 seconds (KV propagation).
- KV allows one write per second per key. A burst of identical misses may try duplicate writes,
  which is harmless because later writes carry the same answer.
- A new data store holds hashed keys and model answers for up to 10 minutes.
- Worst-case spend roughly doubles, from about $4.2 to $8.3–11/day.

## Related Documents

- PRD: docs/00-product/PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-002-demo-site/PLAN.md
