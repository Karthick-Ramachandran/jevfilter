# Demo site

## Purpose

Hosted Cloudflare demo + landing page for jevfilter: Worker API, synthetic helpdesk, X-ray, rate-limited shared Jev key

## Answers

- come up with a cool demo project we can host and show
- build a beautiful landing page explaining what it is, with interactive terminal commands and output, getting started, and FAQs
- make sure the demo is built safely so I don't need to hardcode my key anywhere
- does calling the API from the HTML expose the key in the network tab? (no: the browser calls the Worker, and the Worker calls Jev)
- how many tokens does a demo search use / what does the demo cost
- change the demo's rate limits or pause the demo (DEMO_DISABLED)
- deploy the demo to Cloudflare
- make the demo URL shorter (jevfilter.pages.dev instead of the workers.dev URL)
- a docs page with all the available APIs, supported fields, and what is possible

Live: https://jevfilter.pages.dev (Pages project `jevfilter` for the site; Worker `jevfilter` for /api with secret `TYPESAFE_API_KEY` and kill switch `DEMO_DISABLED`). Deploy the site with `npm run deploy:pages`, and the API with `npm run deploy`, both run in `demo/`.

## Also Known As

- JevFilter Helpdesk, live demo, playground, landing page, workers.dev
- X-ray panel, attack it, leak counter, account switcher
- rate limit, spend cap, kill switch, wrangler, secret

## Start Here

- docs/adrs/ADR-0009-serve-the-demo-on-cloudflare-pages-with-the-api-worker-behind-a-service-binding.md — hosting (Pages + API Worker), key and limits decision
- demo/pages/wrangler.jsonc — Pages project config and the service binding to the Worker
- demo/pages/functions/api/[[path]].ts — forwards /api/* to the Worker
- docs/40-features/F-002-demo-site/PLAN.md — what the demo shows and its acceptance criteria
- demo/wrangler.jsonc — Worker config, assets, rate limits, kill switch
- demo/src/worker.ts — /api/search (trace, tokens), /api/execute, /api/meta
- demo/src/data.ts — synthetic companies, schema, scoped resolver and executor
- demo/public/demo/ — the demo app (index.html, app.js, app.css)
- demo/public/index.html — landing page
- demo/public/landing/ — landing page styles, script, and images
- demo/public/_headers — CSP and security headers
- demo/public/docs/index.html — API reference page, written from src/

## Rules

- ADR-0009 (Pages site, API Worker behind a service binding, key as Worker secret, 10/min per IP, 30/min global)
- ADR-0003 (bring your own key via x-jev-api-key)
- CONVENTIONS: render every string with textContent; no inline script or style (CSP)

## Pitfalls

- LESSONS "Demo site": measure tokens per search before setting a spend cap; CSP forbids inline styles but allows CSSOM.

## Applies To

- demo/**
