# Tasks: NaturalFilter Core (v0.1)

## T1: Core pipeline and schema

Status: Done

Scope: `defineSearch` + five field builders, `createNaturalFilter` (`prepare`/`execute`/`validate`), result union.

Acceptance: plan acceptance criteria in PLAN.md.

Tests: `test/core.test.ts`.

## T2: Deterministic parsers

Status: Done

Scope: dates (calendar periods, rolling windows, prepositions, month names, timezones, ambiguity), numbers (comparators, currencies, grouping, ranges), entity phrase candidates.

Tests: `test/parse.test.ts`.

## T3: Jev provider with bring-your-own-key

Status: Done

Scope: `naturalfilter/jev`: apiKey string | context function | env; pinned model; sanitized errors.

Tests: `test/jev.test.ts` (real SDK, fake fetch).

## T4: Example, playground, evals, release files

Status: Done

Scope: `examples/tickets`, `evals/`, README, LICENSE (MIT), SECURITY.md, CHANGELOG.md, package exports.

## T5: Live Jev evaluation

Status: Done (2026-09-23), model jev-1.13.0, key from `.env`.

- First run 19/23. Fixes: the "filter" intent option allows no conditions; field questions say other fields' words don't count; example resource renamed from "support tickets" to "tickets"; date/number assignment prompt allows unnamed fields; the `DROP_CONFIDENCE` safety net.
- Final run 22/23, 0 security leaks, about 41k input tokens per full run. Answers were identical across repeated runs.
- Then fixed the silent drop on "resolved support tickets" (category support at 0.18-0.22) with a `MENTION_CONFIDENCE` clarification (0.15, chosen from the measured distribution). Final: 23/23 on two consecutive runs, 0 leaks.
- ADR-0001..0003 accepted on 2026-09-23 by the maintainer ("you can acceeot the adrs").

## Completion Evidence

Status: Done.

Files Changed:

- package.json, tsconfig.json, tsconfig.build.json, .gitignore
- src/{index,schema,parse,provider,core,validate,jev,mock}.ts
- test/{core,parse,jev}.test.ts
- examples/tickets/{tickets.ts,server.ts,playground.html}
- evals/{cases,run}.ts
- README.md, LICENSE, SECURITY.md, CHANGELOG.md
- docs: PRODUCT, SECURITY_MODEL, CONVENTIONS, ADR-0001..0003 (Proposed), this feature, context card

Tests Run:

- `npm run check` (typecheck + node --test + build)
- `npm run eval` (offline keyword baseline)
- packed tarball installed into a clean consumer project; type-checked and run
- playground server smoke-tested with curl (prepare/execute/bogus key/hostile filters)

Results:

- See the completion report in the hand-back; the numbers there are from the final run.

Remaining Risks:

- Interpretation quality with live Jev is unmeasured; the `intent` question may over-reject valid queries.
- Keyword baseline is tuned to the eval cases; not a quality benchmark.
- Stateless filters (ADR-0002) have no plan expiry/binding; mitigated by strict re-validation + re-authorization.
