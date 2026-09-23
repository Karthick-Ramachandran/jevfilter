# Lessons

Durable, hard-won lessons for this repository, so agents and humans do not repeat the same mistakes.
Add a lesson when something broke in a non-obvious way, or when a tempting approach turned out to be
wrong. Keep each entry short: what happened, why, and what to do instead. Repository rules override
model preferences.
<!-- Always loads into every session: keep only the few lessons every task needs. -->
<!-- Area sections ride with the pointers when they match the task; the rest are only indexed. -->

## Always

<!-- One bullet per lesson that every task in this repository needs. Keep this list short. -->

<!-- Add an area for each part of the codebase: a "## Billing" heading, an "Applies To:" list of paths such as `src/billing/**`, an optional "Also Known As:" line, then one bullet per lesson. -->

## Packaging

Applies To:

- package.json
- scripts/**
- tsconfig.build.json

- tsc rewrites `.ts` import paths to `.js` in emitted JS but not in `.d.ts` files. `npm run build` runs `scripts/fix-dts-extensions.mjs`, which fails the build if any relative `.ts` import is left in `dist/*.d.ts`.
- The types need TypeScript 5.0+ (`const` type parameters in `enumField`/`defineSearch`); TypeScript 4.9 can't parse them. This is documented in the README and API reference.

## Natural filter pipeline

Applies To:

- src/**
- examples/**
- evals/**

- TypeSafe's API edge firewall answers SQL-looking request text (`'; DROP TABLE`) with HTTP 403 and an HTML page. It surfaces as `unavailable/provider_error` (not retryable). This is expected; don't treat it as a key problem.
- Don't name the resource after an enum value ("support tickets" with category `support`): Jev reads the compound as the record type and drops the filter.
- Jev answered "none" (0.75-0.79) for "on 2026-09-14" when the request didn't name the date field. Dropping a code-parsed date/number now needs `DROP_CONFIDENCE` (0.9) or we ask; covered by the "parsed values are never dropped silently" tests.
- "resolved support tickets": Jev chose category "unspecified" (0.78) with "support" at 0.18-0.22, silently dropping a mentioned value. Plausible alternatives (≥ `MENTION_CONFIDENCE`, 0.15) now produce a `choose_value` question with an "Any" option; covered by the "mentioned values are never dropped silently" tests. Across the other 22 eval queries, alternatives to "unspecified" stayed below 0.05.
- `AbortSignal.timeout()` is unref'd: with a hung provider, Node 22 let the event loop exit before `prepare()` timed out. `prepare()` now uses its own ref'd `setTimeout` and clears it on every path. Covered by "times out a hanging provider" in CI's Node 22 job.
- When the same word is a value in two enum fields ("refunded" as order status and payment status), Jev sets one and asks about the other. Keep value names distinct across fields, or expect a clarification.
- "Shipped to Japan" was read as `status: shipped` plus the country. Phrases that double as a status value become filters; the chip shows it so the user can remove it.
- Cache and in-flight sharing: never coerce a scope with `String()` (objects and undefined collapse to one key), don't let callers inherit another request's failure, timeout, or invalid answer, and treat a hanging store like a failing one. Covered by the "withCache hardening" tests.

## Demo site

Applies To:

- demo/**

- Measure tokens per search before setting a spend cap: the first estimate (1.8k tokens, $1.10/day at 300/min) was about 40x too low for the global cap. The helpdesk schema uses about 2.3k tokens per search, so 300/min is about $42/day. ADR-0010 sets 30/min (about $4.2/day worst case).
- Pages Functions don't support the Rate Limiting binding, and `_headers` doesn't apply to Function responses. Keep rate-limited logic in a Worker and forward `/api/*` to it through a service binding; the Worker sets its own API headers.
- A new `*.pages.dev` project fails TLS for about two minutes after the first deploy, until its certificate is issued. Wait for a 200 before testing.
- Worker CSP forbids inline `<script>`/`<style>`/`style=""`; setting `element.style.x` from a script file (CSSOM) is fine.
- The shop and helpdesk providers use 4 s attempts with one retry inside the 9 s budget. A single 6 s attempt failed twice during a slow period on the Jev API while direct calls took about 450 ms.
- agent-browser: Meta+A doesn't select all in its headless Chromium, so typed text was appended to the old query (and looked like a Jev misread). Clear inputs with `fill <sel> ""`. Screenshot paths are resolved from the browser daemon's working directory, so pass absolute paths.
- Workers can cancel promises that are still pending after the response is sent. Any background write (like the cache's fire-and-forget KV put) must be tracked and handed to `ctx.waitUntil`. `demo/src/kv-cache.ts` keeps `pendingWrites`, and the Worker's fetch passes them on; the local restart test proves the write lands.
- Cloudflare's Rate Limiting binding lags in bursts. With a 10/min per-IP limit, the first 429 came after 12, 20, and 27 rapid requests in three tests, and a request right after a 429 could pass. Treat the configured caps as approximate: short bursts can exceed them 2-3x, so the worst-case spend estimate is not a hard ceiling. For a strict budget, count in a Durable Object.
- Typecheck README code before publishing it. The first Redis snippet typed the client as `ReturnType<typeof createClient>`, which node-redis's generics reject (TS2345), so every user copying it would have hit an error. Type adapters by the methods they use (a small `RedisLike` type) instead.
