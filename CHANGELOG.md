# Changelog

## 0.1.0 — unreleased

First public version.

- `defineSearch` with enum, boolean, number, date and entity fields.
- `createNaturalFilter` → `prepare()` (a union result) and `execute()` (strict re-validation and re-authorization).
- Deterministic date parsing (calendar periods, timezones, ambiguity detection) and number parsing (comparators, currencies, ranges).
- `naturalfilter/jev` provider with bring-your-own-key (string, per-request function, or env).
- `mockProvider` and the offline `keywordProvider`.
- A support-ticket example, a playground, and a nasty-query eval suite.
