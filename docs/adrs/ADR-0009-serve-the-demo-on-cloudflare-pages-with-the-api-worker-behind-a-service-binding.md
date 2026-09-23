# ADR-0009: Serve The Demo On Cloudflare Pages With The API Worker Behind A Service Binding

## Status

Accepted — superseded by ADR-0010-demo-answer-cache-in-workers-kv-and-a-60-per-minute-global-cap

## Supersedes

- ADR-0006-demo-shared-jev-key-capped-at-30-searches-per-minute-globally

## Context

The demo runs as a Worker at `jevfilter.karthiram165.workers.dev`. The maintainer wants the shorter
`jevfilter.pages.dev` ("lets use pages then", 2026-09-23). A Worker URL always carries the account
subdomain, while a Pages project gets `<project>.pages.dev`. Pages Functions don't support the Rate
Limiting binding, and `_headers` rules don't apply to Function responses (Cloudflare docs, checked
2026-09-23).

## Decision

- Static pages (landing, `/demo/`, `/shop/`, `/docs/`, `404.html`) are served by a Pages project
  named `jevfilter`, from `demo/public`, with the `_headers` CSP applied.
- `/api/*` goes to a one-line Pages Function (`demo/pages/functions/api/[[path]].ts`) that forwards
  the request unchanged to the existing Worker `jevfilter` through a service binding (`API`). The
  Worker keeps everything from ADR-0006: the `TYPESAFE_API_KEY` secret, 10/min per-IP and 30/min
  global rate limits, the `DEMO_DISABLED` kill switch, caching (ADR-0008), and its own JSON security
  headers. Requests reach the Worker with the visitor's original `cf-connecting-ip`, so per-IP
  limits still hold.
- The Worker's `workers.dev` URL stays up until the maintainer decides to turn it off. When it is off,
  the Pages Function is the only public way to reach the API.
- Changes go to a Pages preview deployment first and are promoted to production only after the live
  security checks pass there.

## Applies To

- demo/**

## Alternatives Considered

- Move all API logic into Pages Functions: this loses the Rate Limiting binding, which protects the
  shared key's spend.
- A custom domain on the Worker: the cleanest URL, but it needs a domain purchase.
- Change the account's workers.dev subdomain: this moves every Worker on the account and still
  can't produce `jevfilter.workers.dev`.

## Consequences

- Two deployables: the Worker (`npx wrangler deploy` in `demo/`) and the Pages site
  (`npx wrangler pages deploy` in `demo/pages/`). API changes deploy the Worker, and page changes
  deploy Pages.
- One more hop (Pages Function to Worker) on API calls. Service bindings run in the same location,
  so the added latency is small.
- Spend limits are unchanged: worst case about $4.2/day at 30 searches a minute.

## Related Documents

- PRD: jevfilter_PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-002-demo-site/PLAN.md
