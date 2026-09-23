# ADR-0004: Publish As Jevfilter Single Zero Dependency Package With Optional Jev Peer

## Status

Accepted

## Supersedes

- ADR-0001-single-zero-dependency-package-with-optional-jev-peer

## Context

ADR-0001 fixed the npm name as `naturalfilter`. For the launch, the maintainer chose the name
`jevfilter` ("let's name it jevfilter", 2026-09-23). It matches the GitHub repository
(`Karthick-Ramachandran/jevfilter`) and the Jev ecosystem the project launches with. The name was
free on npm when checked. Everything else in ADR-0001 still holds.

## Decision

Ship one npm package, `jevfilter` (product name: JevFilter), with two entry points:

- `jevfilter`: core, with zero runtime dependencies.
- `jevfilter/jev`: the Jev provider. It imports `@typesafe-ai/sdk`, declared as an optional peer
  dependency pinned to `^0.6.0`.

The public API names describe what the code does and stay provider-neutral: `createNaturalFilter`,
`NaturalFilterResult`, `defineSearch`, and so on. Core talks to models only through
`FilterProvider`, so other providers can be added without changes to core. Build with `tsc`, test
with `node --test`, ESM only. No React package in v0.1.

## Applies To

- package.json
- src/**

## Alternatives Considered

- Keep `naturalfilter`: a generic, provider-neutral name, but it doesn't match the repo or the launch
  story.
- Rename the API as well (`createJevFilter`): ties every call site to one provider, which makes a
  second provider awkward later.
- Scoped `@jevfilter/core` + `@jevfilter/jev`: more release machinery than v0.1 needs.

## Consequences

- One install line: `npm install jevfilter @typesafe-ai/sdk`.
- The package name signals Jev. The README must still make clear that the provider is pluggable.
- ESM only: CommonJS consumers need Node 22+ `require(esm)` or a dynamic `import()`.

## Related Documents

- PRD: jevfilter_PRD.md
- Architecture:
- Security: docs/20-security/SECURITY_MODEL.md
- Feature: docs/40-features/F-001-naturalfilter-core/PLAN.md
