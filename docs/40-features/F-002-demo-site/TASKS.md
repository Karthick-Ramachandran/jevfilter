# Tasks: Hosted demo

## T1: Worker, data, demo app

Status: Done (2026-09-23)

Scope: `demo/src/data.ts` (3 fictional companies, 650 tickets each, deterministic per day, duplicate Sams per company), `demo/src/worker.ts` (`/api/search` with X-ray trace + token usage, `/api/execute`, `/api/meta`, rate limits, kill switch), `demo/public/demo/*` (search, clarifications, results, X-ray, attack buttons, BYOK), `_headers` CSP, 404 page.

Evidence (local `wrangler dev` against live Jev, `jev-1.13.0`):

- 13 example and attack searches: 27,583 input tokens (~$0.0012), about 2.3k per search, 300-520 ms each.
- 0 leaked rows. Sam chooser lists only the current company's Sams (Acme 3, Globex 2).
- Hostile prompts → `unsupported/out_of_scope` or `unavailable` (TypeSafe's 403 firewall on SQL-like text).
- `/api/execute` rejects another company's customer id and an injected `company` field.
- Key found in 0 of 18 responses and static files. The CSP header is present.
- `wrangler deploy --dry-run`: 80 KB bundle, limits 10/60 s and 30/60 s.

## T2: Landing page

Status: Done (2026-09-23). Built by a separate agent in `demo/public/index.html` and `demo/public/landing/**`: interactive terminal with six real outputs, "Why Jev instead of a hosted AI search service" (no other vendors named), quick start, FAQ, Geist fonts. Screenshots were checked at 1440/1024/768/390/360 in both themes. Humanizer pass done on the landing page, the demo page copy, and 404.

## T2b: Store demo

Status: Done (2026-09-23). `/shop/` + `demo/src/shop.ts`: 640 fictional products, 8 fields. The filter sidebar fills itself in from the sentence; sidebar clicks and chip removal call `/api/shop/execute` with no model call. Live checks: "red running shoes under $100" → 3 filters; "rated 4.5 or more" routes to rating, not price; "Kestrel or Alder boots" → multiple_values; "cheap stuff" → no_filters. About 2.9k input tokens and 330-450 ms per search.

## T2c: API reference page

Status: Done (2026-09-23). `/docs/` (`demo/public/docs/`), written from the source. A script over the built `.d.ts` found 0 of 172 names missing (all 57 exports, every config option, status, reason and clarification kind). All 73 parser examples on the page were asserted against real output. The review also found six places where the README disagreed with the source, all now fixed. It found `.ts` paths in the published `.d.ts` files, now rewritten to `.js` by `scripts/fix-dts-extensions.mjs` and checked with strict TypeScript 5 consumers. TypeScript 4.9 can't read the types (`const` type parameters), so TypeScript 5.0+ is now documented.

## T3: Deploy

Status: Done (2026-09-23). Live at https://jevfilter.karthiram165.workers.dev (version ff4038bb). Deployed with `npx wrangler deploy`, then `TYPESAFE_API_KEY` set as a Worker secret piped from `.env` over stdin.

Checks against the live URL:

- Landing, /demo/, /shop/ and /docs/ all return 200 with the CSP header; the unknown path returns 404 with CSP.
- Key found in 0 responses or static files; 0 leaked rows; each company's Sam chooser lists only its own customers.
- Cache hit on repeat searches (0 tokens). All 5 tampered execute requests were rejected.
- The per-IP limit returned 429 at the 12th request in a burst. A few later requests passed, which matches the limiter's documented eventual consistency.
- In the browser: Geist fonts load, the store search returns products, and the helpdesk clarification and X-ray render.

## T4: Move the public site to Cloudflare Pages

Status: Done (2026-09-23), ADR-0010. https://jevfilter.pages.dev serves the static pages from Pages. `/api/*` is forwarded by `demo/pages/functions/api/[[path]].ts` to the `jevfilter` Worker through a service binding.

- It went to a preview first (`preview.jevfilter.pages.dev`), with the full security check passing before production.
- In production: 0 key occurrences, 0 leaked rows, and each company's Sam chooser is scoped. All 5 tampered requests were rejected, and cache hits work.
- The CSP header is on all pages, including 404. API responses keep `no-store` and `nosniff`. In the browser, the store search works and Geist loads.
- The same visitor IP reaches the Worker through Pages as when called directly (compared in `wrangler tail` without printing it).
- The Worker's workers.dev URL is still up. Turning it off is the maintainer's call.

## T5: README media and a store fix

Status: Done (2026-09-23).

- `.github/assets/jevfilter-demo.gif` (557 KB, 960 px, 14 s) and `jevfilter-demo.mp4` (217 KB, 1280x800) were recorded on the live store. It shows a sentence becoming four filters and 2 products (1 model call, 2,960 tokens), a chip removed with no model call, and "Kestrel or Alder boots" refused.
- `helpdesk-xray-light.png` and `helpdesk-xray-dark.png` sit in the README in a `<picture>` element that follows the reader's theme.
- The README has the GIF (linking to the live store) and three live-demo buttons. GitHub's markdown API marks the GIF `data-animated-image`, and all badge URLs return 200.
- **Fix:** the store kept the previous search's filters (sidebar badge, selected category, chips) after a refused request or an HTTP error, although nothing ran. `clearAll()` now resets them. Verified locally, then deployed to Pages. `.github/assets` is not in the npm package.

## T6: Launch cap and shared KV answer cache

Status: Done (2026-09-23), ADR-0010. Global cap raised from 30 to 60 per minute; the per-IP cap stays at 10. `demo/src/kv-cache.ts` adds a two-level cache: isolate memory, then Workers KV (`ANSWER_CACHE`, id 5d9b0d2c…), with writes passed to `ctx.waitUntil`.

- **Unit tests:** `demo/test/kv-cache.test.ts` (9) cover cross-isolate sharing, tenant separation, prefix, TTL of at least 60 s, no search text, KV throwing, hanging and write failures, junk values, and a missing binding.
- **Local runtime:** after a full restart of wrangler dev, a store search hit at 0 tokens in 7 ms (was 704 ms, 2,826 tokens). Acme hit and Globex missed.
- **Production:** after a redeploy (version 40bc269a to 4077b800, fresh isolates), a store search hit at 0 tokens in 3 ms (was 714 ms, 2,960 tokens). Acme hit and Globex missed.
- **KV contents** read back from production: answers only, with no search text and no secrets. The chosen labels (e.g. `is "yellow"`) show the interpretation; the security model says so.

Follow-up verification (2026-09-23, after the maintainer asked whether this was properly tested):

- The full live security check was re-run on the KV-enabled Worker: 0 key occurrences, 0 leaked rows, tampering rejected, CSP on all pages.
- Mutation-tested the KV tests with five deliberate breaks. Four were caught at first. The "junk object accepted" break was missed because the test only used a junk string; the test now covers six junk shapes and catches it.
- CI now runs `demo/test/*.test.ts`, which passes on Node 22 and 26.
- Live rate limit: the per-IP 429 came after 27 rapid requests (nominal 10). The limiter is approximate; see LESSONS. The 60/min global cap can't be exercised from a single IP; the deploy output confirms it is configured.
- Still untested: KV actually failing in production (simulated in unit tests only), cross-region propagation (up to 60 s), and whether `waitUntil` is strictly required here (it follows Cloudflare's documented rule).
