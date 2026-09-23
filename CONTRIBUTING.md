# Contributing to JevFilter

Thanks for helping! A few ground rules keep JevFilter small and trustworthy.

## Setup

```sh
npm install
npm test          # unit tests (Node 22.6+ runs the .ts sources directly)
npm run check     # typecheck + tests + build
npm run eval      # nasty-query suite (offline, or live Jev with TYPESAFE_API_KEY in env or .env)
```

## Principles (please keep them)

- **Models interpret, code executes.** A provider only chooses among offered options. Code parses
  every value (dates, numbers, ids), and nothing the model returns is executed.
- **Never drop or widen silently.** A new failure path returns a non-ready status and gets a test
  proving the executor isn't called.
- **Zero runtime dependencies in core.** Provider SDKs are optional peers behind their own entry point.
- **Erasable TypeScript only:** no enums, namespaces, or parameter properties.

## Pull requests

- Add or update tests. Add an eval case (`evals/cases.ts`) for any new interpretation behavior.
- If you change question wording in `src/core.ts`, include before/after `npm run eval` results
  against live Jev.
- Design decisions live in `docs/adrs/`. Propose a new ADR rather than editing an accepted one.
