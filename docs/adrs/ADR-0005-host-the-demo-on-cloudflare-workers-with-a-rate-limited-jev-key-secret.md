# ADR-0005: Host The Demo On Cloudflare Workers With A Rate Limited Jev Key Secret

## Status

Accepted — superseded by ADR-0006-demo-shared-jev-key-capped-at-30-searches-per-minute-globally

## Context

The launch needs a public, hosted demo where visitors can try JevFilter without installing it or
owning a Jev key. That means a server spends the maintainer's Jev key on anonymous traffic. The
maintainer approved hosting on Cloudflare with their key and rate limits (2026-09-23).

## Decision

- The demo lives in `demo/`. It is a Cloudflare Worker with static assets (`demo/public`) and is
  never part of the npm package. It imports the library from `../src` so it always runs current code.
- The maintainer's key is a Worker secret (`TYPESAFE_API_KEY`). It is set from `.env` over stdin,
  never passed as a command argument, never committed, and never logged or returned.
- Visitors can paste their own key in the `x-jev-api-key` header (ADR-0003). It is used for that
  one request and is not rate limited against the shared key.
- Anonymous use of the shared key is rate limited with the Workers Rate Limiting binding: 20
  requests per 60 s per client IP, plus a global limiter of 300 per 60 s as a spend cap. Requests
  are capped at 500 characters (core default). `DEMO_DISABLED=1` is a kill switch.
- Demo data is synthetic, seeded deterministically: three fictional companies and no real people.
  The "signed-in account" comes from a fixed allowlist the visitor picks from, which simulates
  auth. Scope is derived from that account, never from the request text.

## Applies To

- demo/**

## Alternatives Considered

- BYOK only: no spend risk, but most visitors have no Jev key, so the demo wouldn't work for them.
- Vercel/Netlify functions: they work too, but the repo already uses Cloudflare tooling, and the
  Workers free tier plus the rate-limit binding covers this without extra services.
- A precomputed demo with no live model: it can't take free-form input, which is the whole point.

## Consequences

- At about 1.8k input tokens per query at $0.042/M, the shared key costs about $0.0001 per search.
  The global limiter bounds worst-case spend at roughly $1.10/day.
- Rate limiting is eventually consistent, so short bursts can slightly exceed the limits.
- Search text typed by visitors is sent to TypeSafe. The page says so.

## Related Documents

- PRD: jevfilter_PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-002-demo-site/PLAN.md
