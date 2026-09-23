# Test Plan: JevFilter Core (v0.1)

Run: `npm test` (node:test over `test/*.test.ts`), `npm run eval`, `npm run check`.

## Acceptance (test/core.test.ts, "prepare: …")

- Exactly the three configured filters for "open high-priority billing tickets"; the chips match.
- "tickets" → `unsupported/no_filters`. Exclusion → `{ not }`. "open or pending" → `multiple_values`.
- Low probability → `choose_value` clarification whose option patches validate.
- "last week" → the calendar week (Monday start). "under $500" → `{ lt: 500 }`, with the model asked only for the field.
- Currency mismatch → `unit_mismatch`. Contradictory limits → `contradictory`. 03/04/2026 → `ambiguous_date`.
- Three Sams → `choose_entity` with all three; the other tenant's Sam is excluded; no labels sent to the model.
- Single match binds; zero matches → `no_match`.

## Security / containment (risk-driven)

- A provider that throws, returns an out-of-set answer, returns a SQL-like choice, misses answers, or returns null → `unavailable`, and the executor call count is 0.
- A hanging provider → `unavailable/timeout` within `timeoutMs`.
- `intent: other` → `out_of_scope`; the executor is never called.
- Chaos provider (200 random answer sets with random probabilities): every `ready` result and every clarification patch passes `validateFilters`.
- `authorize` false or throwing → `blocked` before any provider call. Input bounds are enforced before any provider call.
- User text never appears in instructions (it goes in `state` only).
- `execute`: rejects unknown fields, `__proto__`, off-enum values, unknown operators, NaN, impossible ranges, bad dates, arrays, and empty filters. Re-authorizes. Re-verifies entity ids against the current scope. Zero matches → empty success.

## Parsers (test/parse.test.ts)

- Calendar periods, weekStartsOn, rolling windows (exactly N days), prepositions, yearless dates, ambiguous and invalid dates, the verb "may", timezone "today".
- Comparators, currencies, Indian grouping, k/lakh suffixes, ranges; "P1" and date digits are not read as numbers.

## Provider (test/jev.test.ts, real SDK + fake fetch)

- Per-tenant keys reach `Authorization: Bearer <key>`; the pinned model and `state` go over the wire.
- Missing tenant key → non-retryable `unavailable`, no HTTP call. 401 → non-retryable, and the key appears in neither the result nor the logged error. 503 → retryable.

## Evals (evals/cases.ts)

23 nasty queries. Security cases assert no cross-tenant rows after execution. They run offline
against the keyword baseline, and against live Jev when `TYPESAFE_API_KEY` is set (env or `.env`). Live `jev-1.13.0`: 23/23.

## Silent-drop guards (test/core.test.ts)

- A parsed date/number is dropped only when "none" ≥ 0.9, otherwise `choose_field` (with a "Don't filter by this" option).
- "unspecified" with a plausible value (≥ 0.15) produces `choose_value` with an "Any" option. Negligible alternatives don't ask.
