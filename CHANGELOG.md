# Changelog

## 0.1.1 — 2026-09-23

Documentation only; no code changes.

- README: demo GIF, links to the live demos (https://jevfilter.pages.dev) and API reference, a light/dark screenshot of the helpdesk X-ray, and the four known eval failures.
- Images use absolute URLs so they also render on npm.
- New headline and plainer copy across the README, landing page and package description ("Turn a user's search sentence into filters your API already accepts."), after a no-ai-slop pass.
- README explains how to run the eval on your own schema (copy `evals/` and point `run.ts` at your setup); it previously implied `npm run eval` works on any schema as is.

## 0.1.0 — 2026-09-23

First public version, published as `jevfilter`.

- `defineSearch` with enum, boolean, number, date and entity fields.
- `createNaturalFilter` → `prepare()` (a union result) and `execute()` (strict re-validation and re-authorization).
- Deterministic date parsing (calendar periods, timezones, ambiguity detection) and number parsing (comparators, currencies, ranges).
- `jevfilter/jev` provider with bring-your-own-key (string, per-request function, or env).
- `mockProvider` and the offline `keywordProvider`.
- `withCache(provider, { store, scope | shared })` and `memoryCache()`: cache model answers per tenant; everything else still runs on each search.
- `authorize` is required; public data opts out explicitly with `allowUnauthenticated: true`.
- Provider answers without a probability count as unknown confidence and produce a question.
- `npm run eval` exits non-zero when any case fails (`--report-only` to opt out).
- Silent-drop guards: parsed dates and numbers are dropped only at ≥ 0.9 confidence; plausible values become `choose_value` questions with an "Any" option.
- A support-ticket example, a playground, and a nasty-query eval suite (23/23 on `jev-1.13.0`).
