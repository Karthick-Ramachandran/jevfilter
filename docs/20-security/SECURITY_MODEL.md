# Security Model

## Status

v0.1. Mirrors `SECURITY.md` (public) and PRD section 9 (the threat model this subset implements).

## Baseline Rules

- Never commit secrets or credentials, and never read or copy `.env` files into docs.
- Validate and authorize untrusted input at every trust boundary.
- Do not add network, telemetry, cloud, MCP runtime, or AI API behavior without explicit review.

## Trust boundaries

- **Untrusted:** user text, client-submitted filters, provider answers, resolver candidate labels.
- **Trusted:** the server-side schema, the `context` the host app derives from its session, and the
  host's `authorize`, `resolve`, `verify`, and `executor` functions.
- Provider answers are accepted only if they are one of the offered option labels (`src/core.ts`).
  Values come from code parsers or the resolver, never from the model.
- `execute()` re-validates filters strictly (`src/validate.ts`) and re-runs `authorize` (ADR-0002).
- User text is sent as `state`, separate from instructions compiled from the schema. Entity
  candidate labels are never sent to the model.

## Authentication And Authorization

The library does not authenticate anyone. The host passes a trusted `context`. `authorize(context)`
is deny-by-default: false or a throw means `blocked`. It runs before any model call and again on
every `execute`. The executor must apply tenant/user scope from `context` as an outer AND. Filters
never carry scope.

## Secrets And Configuration

The only secret is the Jev API key. The adopter supplies it (ADR-0003): as a string, as a per-request
function of the context, or through `TYPESAFE_API_KEY`. Server-side only (the SDK's
`dangerouslyAllowBrowser` is never set). SDK logging is set to `off`. Errors are replaced with
sanitized `ProviderError` messages. No key cache across requests. The playground accepts a key in
the `x-jev-api-key` header for a single request, binds to 127.0.0.1 by default, and never logs or
stores the key.

## Sensitive Data

The search text goes to the configured Jev endpoint. Records, candidate labels, and credentials do
not. No telemetry. Results carry no raw error details. `onError` lets hosts log, and they own what
they log.

## Dependencies And Supply Chain

Core has zero runtime dependencies. `@typesafe-ai/sdk` is an optional peer (`^0.6.0`), pinned to an
exact version in devDependencies. Dev tooling: `typescript` and `@types/node` only. Tests use `node:test`.
