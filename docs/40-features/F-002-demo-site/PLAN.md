# Plan: Hosted demo ("JevFilter Helpdesk")

A public demo that shows what JevFilter refuses and asks, as well as what it gets right.

## Approach

A Cloudflare Worker (`demo/`, ADR-0006) serves a static single-page app and one JSON API that runs
the real library (`../src`) against about 2,000 synthetic tickets across three fictional companies.

The page has three parts:

1. **Search:** the user types a request and sees the chips, any clarification buttons, and the results table.
2. **X-ray:** what code parsed (dates and numbers, with their spans), each question Jev was asked
   with its top probabilities, and the final validated filters. It also says "SQL generated: none".
3. **Attack it:** one-click hostile prompts, plus an account switcher (Acme / Globex / Initech). It
   shows a live count of rows from other companies, which should always be 0, and how scope comes
   from the account rather than the text.

## Boundaries

- The demo is not in the npm package, and nothing in `src/` changes for it.
- Its only store is in-memory seeded data. No database, no analytics, no cookies beyond what's needed.
- The shared key is used behind rate limits and a kill switch; visitors can bring their own key.

## Acceptance Criteria

- The hero query "urgent billing tickets from last week" returns chips and matching rows.
- "Sam's tickets" shows a chooser listing only the current company's Sams. Picking one runs the search.
- The hostile prompts return `unsupported` or `unavailable`, and the leak counter stays 0.
- Switching company changes the results for the same query. No query can reach another company's rows.
- Over the rate limit → 429 with a friendly message. `DEMO_DISABLED=1` → 503.
- The page works on a phone, supports light and dark mode, and renders every model or user string as text.
