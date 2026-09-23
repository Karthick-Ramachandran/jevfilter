# Tasks: JevFilter Core (v0.1)

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

Scope: `jevfilter/jev`: apiKey string | context function | env; pinned model; sanitized errors.

Tests: `test/jev.test.ts` (real SDK, fake fetch).

## T4: Example, playground, evals, release files

Status: Done

Scope: `examples/tickets`, `evals/`, README, LICENSE (MIT), SECURITY.md, CHANGELOG.md, package exports.

## T5: Live Jev evaluation

Status: Done (2026-09-23), model jev-1.13.0, key from `.env`.

- First run 19/23. Fixes: the "filter" intent option allows no conditions; field questions say other fields' words don't count; example resource renamed from "support tickets" to "tickets"; date/number assignment prompt allows unnamed fields; the `DROP_CONFIDENCE` safety net.
- Final run 22/23, 0 security leaks, about 41k input tokens per full run. Answers were identical across repeated runs.
- Then fixed the silent drop on "resolved support tickets" (category support at 0.18-0.22) with a `MENTION_CONFIDENCE` clarification (0.15, chosen from the measured distribution). Final: 23/23 on two consecutive runs, 0 leaks.
- ADR-0002 and ADR-0003 accepted on 2026-09-23 by the maintainer ("you can acceeot the adrs"); the packaging decision is now ADR-0004.

## T6: npm launch packaging as `jevfilter`

Status: Done (2026-09-23). Not published or pushed; that is the maintainer's call.

Scope: rename to `jevfilter` (ADR-0004, confirmed by the maintainer: "let's name it jevfilter"), package metadata, `prepack` build, `lint:package` (publint + attw esm-only), CI (`.github/workflows/ci.yml`: check on Node 22/24 and a Node 20 consumer of the packed tarball), CONTRIBUTING.md, launch README (humanized).

Evidence: publint "All good!", attw green for ESM (CJS/node10 intentionally unsupported), tarball 27.4 kB / 21 files, clean-install consumer typechecks and gets live Jev results matching the README hero example, live eval 23/23.

## T7: Answer cache

Status: Done (2026-09-23), ADR-0008 accepted by the maintainer. `src/cache.ts`: `withCache`, `memoryCache`, scope required, in-flight sharing, `meta.cached`.

An independent review found 7 bugs, all reproduced: non-string scope merged tenants; `shared` collided with a tenant named "shared"; a hung provider blocked later searches; a hung store broke search; a non-finite TTL never expired; waiting callers inherited an invalid answer; and a failed leader fanned out uncached calls. All are fixed. `test/cache.test.ts` now has 19 tests, and all 8 new ones fail on the pre-review code. Live demo: a repeat store search went from 602 ms and 2,829 tokens to 1 ms and 0 tokens, and a different company missed the cache as intended.

## Completion Evidence

Status: Done.

Files Changed:

- package.json, tsconfig.json, tsconfig.build.json, .gitignore
- src/{index,schema,parse,provider,core,validate,jev,mock}.ts
- test/{core,parse,jev}.test.ts
- examples/tickets/{tickets.ts,server.ts,playground.html}
- evals/{cases,run}.ts
- README.md, LICENSE, SECURITY.md, CHANGELOG.md
- docs: PRODUCT, SECURITY_MODEL, CONVENTIONS, ADR-0002..0004, this feature, context card

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
