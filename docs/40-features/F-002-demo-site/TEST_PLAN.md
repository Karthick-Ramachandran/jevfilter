# Test Plan: Hosted demo

Automated core behavior is covered by the library tests (`npm test`). The demo adds integration checks, run against `wrangler dev`:

- Every example and attack query returns the expected status; the token sum is reported.
- `leakedRows` is 0 for every search. The Sam chooser is scoped to the account.
- `/api/execute` rejects foreign entity ids, unknown fields, and scope-like fields.
- The key is absent from every API response and static file (exact-match check, never printed).
- The CSP header is present on static pages. There is no inline script or style in `demo/public/**`.
- After deploy: the same checks against the workers.dev URL, plus a 429 after exceeding 10 searches a minute from one IP.
