# ADR-0001: Single Zero Dependency Package With Optional Jev Peer

## Status

Accepted

## Context

The PRD sketches six packages (core, provider-jev, executor-api, react, examples, evals). The first
release needs to be small, easy to install ("npm install naturalfilter @typesafe-ai/sdk"), and cheap
to maintain. Every runtime dependency in core adds supply-chain risk for every adopter.

## Decision

Ship one npm package, `naturalfilter`, with two entry points:

- `naturalfilter`: core, with zero runtime dependencies.
- `naturalfilter/jev`: the Jev provider. It imports `@typesafe-ai/sdk`, which is declared as an
  optional peer dependency pinned to `^0.6.0`.

The core talks to models only through the `FilterProvider` interface (closed choice questions), so
other providers can be added later without touching core. Build with `tsc`, test with `node --test`.
No React package in v0.1.

## Applies To

- package.json
- src/**

## Alternatives Considered

- A monorepo with `@naturalfilter/core` and `@naturalfilter/jev`: cleaner names, but more release
  machinery than one person needs for v0.1. We can split later without breaking the entry points
  (for example by re-exporting).
- Bundling the SDK as a hard dependency: this forces it on people who only use the mock or a custom
  provider.

## Consequences

- One version number and one changelog; install is easy.
- The provider interface is only choice questions, so a provider can't return free text for core
  to execute.
- A React component and database adapters are left to later releases.

## Related Documents

- PRD: jevfilter_PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-001-naturalfilter-core/PLAN.md
