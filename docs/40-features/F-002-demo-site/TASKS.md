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

Status: In progress (separate agent): `demo/public/index.html`, `demo/public/landing/**`.

## T3: Deploy

Status: Todo. `npx wrangler secret put TYPESAFE_API_KEY` (value piped from `.env`), then `npx wrangler deploy`.
