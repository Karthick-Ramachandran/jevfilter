# ADR-0002: Stateless Validated Filters Instead Of Server Side Plan Store

## Status

Accepted

## Context

PRD section 6 proposes storing server-owned plans bound to principal, tenant, schema, and expiry, and
executing by plan ID. That needs a storage layer (a new data store) that every adopter would have to
provide. The threat it addresses (SEC-05, a client editing or replaying a plan) matters because a plan
could grant more than the user could otherwise request.

## Decision

v0.1 keeps no plan store. `prepare()` returns plain typed `filters`. `execute(filters, context)` treats
those filters as untrusted input from the client:

1. It validates them strictly against the schema: unknown fields, unknown operators, values outside
   an enum, non-finite numbers, and malformed dates are all rejected.
2. It calls `authorize(context)` again, using the current trusted session.
3. It passes only validated filters to the developer's `executor`, which applies the tenant/actor
   scope as an outer AND.

So an edited filter object can express only what a normal filter UI already allows. It can never
widen scope, because scope comes from `context`, never from `filters`.

## Applies To

- src/core.ts
- src/validate.ts

## Alternatives Considered

- A server-side plan store with signed plan IDs (the PRD design): stronger binding and replay
  control, but it needs storage and expiry machinery. We can add it later as an opt-in option.
- HMAC-signed filter blobs: no storage needed, but they add key management and give little extra
  protection, since the filters are re-validated anyway.

## Consequences

- No storage dependency; any existing endpoint can use it.
- A user can hand-craft filters that skip the natural-language step. That is equivalent to using the
  manual filter UI, and it is still authorized and validated.
- There's no "plan expired" or "schema changed" detection beyond re-validation against the current schema.

## Related Documents

- PRD: jevfilter_PRD.md (sections 6, 7, SEC-05)
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-001-naturalfilter-core/PLAN.md
