# ADR-0006: Demo Shared Jev Key Capped At 30 Searches Per Minute Globally

## Status

Accepted

## Supersedes

- ADR-0005-host-the-demo-on-cloudflare-workers-with-a-rate-limited-jev-key-secret

## Context

ADR-0005 capped anonymous use of the shared key at 300 searches/min globally and estimated worst
case spend at about $1.10/day. That estimate was wrong. Measured on the helpdesk schema, a search
uses about 2.3k input tokens (27,583 tokens over 13 searches). At $0.042/M, a saturated 300/min cap
costs about $42/day. The maintainer chose a 30/min global cap (2026-09-23, answering the spend-cap
question with "30/min global").

## Decision

Everything in ADR-0005 stands except the limits:

- The demo lives in `demo/` as a Cloudflare Worker with static assets. It imports `../src` and is not
  part of the npm package.
- The shared key is the Worker secret `TYPESAFE_API_KEY`. It is set from `.env` over stdin, and is
  never passed as a command argument, committed, logged, or returned. The browser only ever calls the
  demo's own `/api/*` routes; the Worker calls Jev server-side.
- Visitors may send their own key in `x-jev-api-key` (ADR-0003). That key is used for one request
  and bypasses the shared-key limits.
- Shared-key limits (Workers Rate Limiting binding): **10 searches per 60 s per client IP** and
  **30 per 60 s globally**. `DEMO_DISABLED=1` is the kill switch.
- Data is synthetic. The "signed-in account" comes from a fixed allowlist, and scope is derived from
  it, never from the request text.

## Applies To

- demo/**

## Alternatives Considered

- 60/min global: worst case about $8.3/day; handles bigger spikes.
- 300/min (ADR-0005 as written): worst case about $42/day.
- A daily token budget in a Durable Object: an exact cap, but more infrastructure than a demo needs.

## Consequences

- Worst-case spend, if saturated 24h: 30 × 1,440 × 2.3k tokens × $0.042/M ≈ $4.2/day. Typical traffic
  is far lower.
- During spikes, visitors past the cap see "busy, wait a minute or paste your own key".
- The limiter is eventually consistent, so short bursts can slightly exceed the cap.

## Related Documents

- PRD: jevfilter_PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-002-demo-site/PLAN.md
