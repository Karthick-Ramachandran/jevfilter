# ADR-0008: Provider Answer Cache With Explicit Scope

## Status

Accepted

## Context

Repeated searches ("urgent billing tickets", "open tickets") cost a model call each time, about
2.3k-4k input tokens and 300-500 ms. The maintainer asked for caching support (2026-09-23). PRD
SEC-09 requires that a cache never crosses an access boundary and never skips fresh authorization.

## Decision

- Caching wraps the provider: `withCache(provider, { store, scope | shared, ttlMs })`. It caches
  only provider answers. `authorize`, answer validation, entity resolution, and the executor still
  run on every `prepare`/`execute`.
- Cache key = SHA-256 of `{ provider name, provider model, scope, state, questions }`. The questions
  are compiled from the schema, so schema changes produce new keys. Date values aren't in the
  questions (code resolves them after the answers), so cached answers stay correct across days.
- Scope is explicit. Either `scope: (context) => string` (for example the tenant id) or
  `shared: true` for public data. Leaving out both throws (CONVENTIONS: security-relevant omissions
  fail loudly).
- Before storing, a response must contain a valid option for every question asked. Errors and
  invalid answers are never cached.
- Identical concurrent lookups share one in-flight provider call.
- `memoryCache({ maxEntries, ttlMs })` (in-process LRU) ships with core. Other stores implement
  `get`/`set`.
- Results report `meta.cached: true` on a hit.

## Applies To

- src/cache.ts
- src/provider.ts
- src/core.ts

## Alternatives Considered

- Cache the whole `NaturalFilterResult`: this would skip entity resolution and date math, which
  depend on the current user and today's date. Rejected.
- Cache without a scope: a shared cache reveals, through timing, that someone else searched the
  same text. Kept available only as an explicit `shared: true`.

## Consequences

- Repeat searches cost 0 model tokens and skip the provider round trip.
- A model upgrade changes the key only if the provider reports its model (`jev()` does). Custom
  providers should set `model`.
- Stale answers can live for up to `ttlMs` (default 10 minutes) after a behavior change on the
  provider side. The pinned model mitigates this.

## Related Documents

- PRD: jevfilter_PRD.md (SEC-09)
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-001-naturalfilter-core/PLAN.md
