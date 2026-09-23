# Changelog

## 0.1.0 — unreleased

First public version, published as `jevfilter`.

- `defineSearch` with enum, boolean, number, date and entity fields.
- `createNaturalFilter` → `prepare()` (a union result) and `execute()` (strict re-validation and re-authorization).
- Deterministic date parsing (calendar periods, timezones, ambiguity detection) and number parsing (comparators, currencies, ranges).
- `jevfilter/jev` provider with bring-your-own-key (string, per-request function, or env).
- `mockProvider` and the offline `keywordProvider`.
- `authorize` is required; public data opts out explicitly with `allowUnauthenticated: true`.
- Provider answers without a probability count as unknown confidence and produce a question.
- `npm run eval` exits non-zero when any case fails (`--report-only` to opt out).
- Silent-drop guards: parsed dates and numbers are dropped only at ≥ 0.9 confidence; plausible values become `choose_value` questions with an "Any" option.
- A support-ticket example, a playground, and a nasty-query eval suite (23/23 on `jev-1.13.0`).
