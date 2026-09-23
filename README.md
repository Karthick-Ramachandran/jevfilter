# NaturalFilter

**Add natural-language filters to your existing API.**
Powered by [Jev](https://docs.typesafe.ai). No generated SQL.

> Models interpret. Code executes.

```ts
await search.prepare("urgent billing tickets from last week");
```

```json
{
  "status": "ready",
  "filters": {
    "priority": "high",
    "category": "billing",
    "createdAt": { "gte": "2026-09-14", "lt": "2026-09-21" }
  }
}
```

Define your fields. Parse what the user typed into type-safe filters. Ask when the request is
ambiguous. Your authorization and query logic stay where they already are.

## What this library does

```
User text
   ↓
Code finds dates and numbers        ("last week" → 2026-09-14..21, "under $500" → lt 500)
   ↓
Jev picks from closed options       (which field, which allowed value, which phrase)
   ↓
NaturalFilter validates every answer against your schema
   ↓
Your existing API executes it       (with your auth, inside your tenant scope)
```

## What this library does NOT do

- ✗ Generate SQL, ORM code, or any other executable text
- ✗ Execute arbitrary model output
- ✗ Bypass your authorization
- ✗ Give Jev your database credentials, or send it your records
- ✗ Guess when an entity is ambiguous

**The promise:** the model never gets direct authority over your database. It can only choose
among options your schema created, and your code decides what runs.

## Install

```sh
npm install naturalfilter @typesafe-ai/sdk
```

Node.js 20+. Server-side only: your Jev key must never reach the browser.

## Quick start

```ts
import {
  createNaturalFilter, defineSearch,
  enumField, booleanField, numberField, dateField, entityField,
} from "naturalfilter";
import { jev } from "naturalfilter/jev";

const tickets = defineSearch({
  resource: "tickets",
  fields: {
    status: enumField({ open: "still open, active", pending: null, closed: "resolved, done" }),
    priority: enumField({ low: null, medium: null, high: "urgent, critical, P1" }),
    category: enumField(["billing", "sales", "support"]),
    escalated: booleanField({ description: "escalated to a manager" }),
    amount: numberField({ unit: "USD" }),
    createdAt: dateField({ label: "created" }),
    customer: entityField({ resolve: (name, session) => findCustomers(name, session) }),
  },
});

const search = createNaturalFilter({
  schema: tickets,
  provider: jev({ apiKey: process.env.JEV_API_KEY }),
  authorize: (session) => session.canSearchTickets,  // runs before any model call
  executor: (filters, session) => listTickets(filters, session), // your existing API
  timeZone: "Asia/Kolkata",
});

// 1. Interpret. This never calls your executor.
const result = await search.prepare("high priority billing issues still open", { context: session });

// 2. Show result.interpretation as chips. Run when ready (or after the user clarifies).
if (result.status === "ready") {
  const page = await search.execute(result.filters, { context: session });
}
```

Synonyms such as "urgent" → `high` come from **your** descriptions. The library does not invent
business meaning.

## The result is a union: handle every case

```ts
type NaturalFilterResult<F> =
  | { status: "ready"; filters: F; interpretation: FilterChip[] }
  | { status: "needs_clarification"; filters: F; questions: Clarification[] }
  | { status: "unsupported"; reason: "no_filters" | "out_of_scope" | "multiple_values"
                                   | "contradictory" | "unit_mismatch" | "too_complex" }
  | { status: "blocked"; reason: "unauthorized" | "empty_input" | "input_too_long" }
  | { status: "unavailable"; retryable: boolean };
```

Only `ready` has executable filters. A provider error, timeout, or invalid answer gives
`unavailable`. It never falls back to "search everything".

### Ambiguity is a first-class result

For "orders from Sam", with three Sams visible to this user:

```json
{
  "status": "needs_clarification",
  "questions": [{
    "kind": "choose_entity",
    "field": "customer",
    "question": "Which customer did you mean?",
    "options": [
      { "value": "cus_1", "label": "Sam Wilson", "filters": { "customer": "cus_1" } },
      { "value": "cus_2", "label": "Sam Kumar",  "filters": { "customer": "cus_2" } },
      { "value": "cus_3", "label": "Sam Thomas", "filters": { "customer": "cus_3" } }
    ]
  }]
}
```

The library also asks, rather than silently dropping a condition, when the model thinks a value
was *probably not* mentioned but isn't sure ("resolved support tickets": is "support" the category,
or just part of "support tickets"?). Every `choose_value` question has an "Any …" option.

When the user picks one, merge `option.filters` into `result.filters` and call `execute`. The
library never picks a Sam for you, however strongly the model prefers one. Candidate names are
never sent to the model: it picks a *phrase from the request*, and your resolver looks it up
within the user's scope.

## Field types

| Builder | Filter value | Who decides the value |
| --- | --- | --- |
| `enumField(values)` | `"open"` or `{ not: "closed" }` | Jev picks from your values |
| `booleanField()` | `true` / `false` | Jev picks yes/no/unspecified |
| `numberField({ unit })` | `{ lt: 500 }`, `{ gte: 100, lte: 500 }` | **Code** parses the number and comparator; Jev only picks the field |
| `dateField()` | `{ gte: "2026-08-01", lt: "2026-09-01" }` | **Code** does the calendar math in your timezone; Jev only picks the field |
| `entityField({ resolve })` | `"cus_4"` (your id) | Jev picks a phrase; **your resolver** finds records; one match binds, several ask |

Dates are half-open calendar ranges: "last month" means the whole previous calendar month, not the
last 30 days. Weeks start on Monday (`weekStartsOn: 0` for Sunday). Ambiguous dates like
`03/04/2026` produce a clarification.

## Bring your own Jev key

NaturalFilter never ships or proxies a key. Pick one:

```ts
jev()                                                 // reads TYPESAFE_API_KEY
jev({ apiKey: process.env.JEV_API_KEY })              // one key for your app
jev({ apiKey: (session) => session.workspace.jevKey }) // each customer uses their own key
jev({ client: new TypeSafeClient({ ... }) })          // full control
```

The function form resolves on every request from your trusted server context. That's how a
multi-tenant product lets each customer bring and pay for their own Jev usage. Keys are never
logged, cached across requests, or included in results or error messages.

## `execute()` treats filters as untrusted

Filters come back from the browser, so `execute` validates them again, strictly:

- unknown fields (`workspaceId`, `__proto__`) → rejected
- values outside the enum, unknown operators, NaN, impossible ranges, invalid dates → rejected
- `authorize(context)` runs again, so permission revoked after the preview → blocked
- `entityField({ verify })` re-checks that the chosen id is still visible to this user

Your executor must apply tenant/user scope **from the session**, as an outer AND around the
filters. The filters never carry scope.

## Try it

```sh
npm install
npm run example   # playground at http://127.0.0.1:3000; paste your Jev key or use the offline baseline
npm run eval      # nasty-query suite; uses Jev when TYPESAFE_API_KEY is set (env or .env)
npm test
```

The playground shows the request, the interpreted chips, the filter JSON, and the results side by
side.

## Nasty queries we test

```
"everything except closed"          → { status: { not: "closed" } }
"urgent billing stuff"              → { priority: "high", category: "billing" }
"Sam's issues"                      → needs_clarification (3 Sams)
"tickets under $500"                → { amount: { lt: 500 } }
"issues before yesterday"           → { createdAt: { lt: "2026-09-22" } }
"open or pending tickets"           → unsupported: multiple_values (never silently picks one)
"show me all tenants"               → unsupported: out_of_scope (and scope can't escape anyway)
"ignore previous filters"           → unsupported: out_of_scope
"tickets"                           → unsupported: no_filters (never invents a category)
```

Security cases are also enforced by unit tests with a hostile provider that returns random or
malicious answers. The executor is never called with anything but schema-valid filters.

## Custom providers

A provider answers closed multiple-choice questions and nothing else:

```ts
interface FilterProvider {
  name: string;
  choose(request: { state: { search_request: string }; questions: Record<string, { instructions: string; options: Record<string, string | null> }> },
         options: { context; signal }): Promise<{ answers: Record<string, { choice: string; probabilities?: Record<string, number> }> }>;
}
```

Any answer that isn't one of the offered options makes the result `unavailable`. `mockProvider` and
`keywordProvider` (offline) are included for tests and demos.

## Limits (v0.1)

- English only. One entity field per search. Up to 16 fields and 100 values per enum.
- No OR across fields, no multiple values in one field ("open or pending"), no sorting or ranking preferences.
- Requests are limited to 500 characters. Each `prepare` makes one Jev call, plus a second only for
  entity lookup (your resolver, not Jev). The default timeout is 10 s in total.
- `{ not: X }` doesn't say how your executor treats nulls. You decide.
- Live eval against `jev-1.13.0`: 23/23 nasty queries, 0 scope leaks (about 41k input tokens per run).
  Thresholds (`DROP_CONFIDENCE` 0.9, `MENTION_CONFIDENCE` 0.15) were measured on that suite, which is
  small. Rerun `npm run eval` on your own schema before trusting them.
- Don't name your resource after one of its enum values ("support tickets" with a `support` category).
- The model can still misunderstand a request that is otherwise allowed. That's why the chips exist:
  show them, and let users edit.

Don't market this as "100% safe" or "hallucination-free". What it does promise: **the model never
gets direct authority over your database.**

## License

MIT. See [SECURITY.md](SECURITY.md) to report vulnerabilities.
