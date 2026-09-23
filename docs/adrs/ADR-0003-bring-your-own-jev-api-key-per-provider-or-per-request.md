# ADR-0003: Bring Your Own Jev API Key Per Provider Or Per Request

## Status

Accepted

## Context

NaturalFilter is open source, so the project must never ship or proxy a maintainer key. Adopters
bring their own Jev (TypeSafe) API key. Some adopters are multi-tenant products where each customer
pays for their own Jev usage and supplies their own key.

## Decision

`jev({ apiKey })` accepts:

- a string: one client, created lazily and reused;
- a function `(context) => string | Promise<string>`: resolved on every `prepare()` from the trusted
  server context, with a fresh `TypeSafeClient` for that call. No key cache is kept;
- nothing: the SDK falls back to the `TYPESAFE_API_KEY` environment variable.

It also accepts `client` to inject a pre-built `TypeSafeClient`. Keys are server-side only. The
provider never sets `dangerouslyAllowBrowser`, never logs a key, and never puts a key in an error
message or a result. The example playground accepts a visitor's key in a request header, uses it for
that single request, and never stores or logs it.

## Applies To

- src/jev.ts
- examples/**

## Alternatives Considered

- Only the environment variable: simplest, but it rules out per-customer keys.
- A per-key client cache: saves object construction, but keeps many secrets in memory for the life of
  the process. Constructing a client is cheap, so we skip the cache.

## Consequences

- One code path works for single-tenant and multi-tenant (BYOK) deployments.
- Once the key is resolved, the developer is responsible for storing customer keys securely.
- The playground sends a key from browser to server. It must run on localhost or behind HTTPS.

## Related Documents

- PRD: jevfilter_PRD.md (section 10)
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-001-naturalfilter-core/PLAN.md
