# Conventions

The canonical, reusable vocabulary for this repository. Agents reference these by name and reuse them
instead of inventing new components, helpers, or patterns. Repository rules override model
preferences.

## Canonical Primitives

- `FilterProvider` / `ProviderError` (`src/provider.ts`): the only way core talks to a model. Closed
  choice questions in, option labels out. New providers implement this; don't add another model path.
- `validateFilters` / `isSatisfiable` (`src/validate.ts`): the single filter gate. Reuse it for any
  new entry point that accepts filters.
- `parseDates` / `parseNumbers` / `phraseCandidates` / `todayIn` (`src/parse.ts`): all value
  extraction. Never ask a model for a value.
- `mockProvider` / `keywordProvider` (`src/mock.ts`): offline providers for tests, demos, evals.
- `createTicketFilter` / `ticketSearch` / `listTickets` (`examples/tickets/tickets.ts`): the shared
  fixture for tests, evals and the playground.

## Naming Conventions

- Provider question ids: `intent`, `field_<name>`, `date_<i>`, `number_<i>`, `entity_<name>`.
- Enum option labels: `is "<value>"`, `is not "<value>"`, plus `unspecified`, `several values`, `unclear`.
- Result statuses: `ready | needs_clarification | unsupported | blocked | unavailable`, each non-ready
  status with a `reason` code.

## Rules

- Core (`src/` except `src/jev.ts`) imports nothing outside `node:`-free standard JS. No runtime deps.
- TypeScript must be erasable (`erasableSyntaxOnly`): no enums, namespaces, or parameter properties.
  Imports use `.ts` extensions; `tsc` rewrites them to `.js` on build.
- A security-relevant omission must fail loudly: leaving out `authorize` throws unless
  `allowUnauthenticated: true` is set. Don't add new options that default to "allow".
- Missing provider confidence is unknown (0), never certain (1).
- Every non-ready status must never call the executor. Add a containment test for any new failure path.
- Every new provider answer must be checked against its option set before use.
- Strings from users, models or resolvers are rendered with `textContent`, never `innerHTML`.

## Anti-Patterns

- Spreading model output into a query object → map validated filters explicitly in the executor.
- Falling back to "no filters" or keyword search when the provider fails → return `unavailable`.
- Auto-binding the top entity candidate because the model prefers it → return `choose_entity`.
- Sending candidate labels or records to the model → send only phrases from the user's own text.
