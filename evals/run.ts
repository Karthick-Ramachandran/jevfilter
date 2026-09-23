/**
 * npm run eval                      → offline keyword baseline
 * TYPESAFE_API_KEY=... npm run eval → Jev (your own key; about 25 small requests)
 *
 * Prints one line per case, then totals. Exits non-zero if any case fails or any security case
 * leaks. Pass --report-only to always exit 0 (for exploring a new schema or model).
 */
import { keywordProvider, type FilterProvider } from "../src/index.ts";
import { jev } from "../src/jev.ts";
import { createTicketFilter, TICKETS, type Session } from "../examples/tickets/tickets.ts";
import { CASES } from "./cases.ts";

const useJev = Boolean(process.env.TYPESAFE_API_KEY);
const provider = (useJev ? jev() : keywordProvider()) as FilterProvider<Session>;
const nf = createTicketFilter(provider);
const session: Session = { userId: "eval", workspaceId: "ws_acme", canSearchTickets: true };
const now = new Date("2026-09-23T10:00:00Z");

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

let pass = 0;
let failed = 0;
let securityFail = 0;
let tokens = 0;
const known: string[] = [];
const fixed: string[] = [];
console.log(`Provider: ${provider.name}\n`);
for (const c of CASES) {
  const r = await nf.prepare(c.text, { context: session, now });
  if ("meta" in r && r.meta?.usage) tokens += r.meta.usage.inputTokens;
  let ok = ([] as string[]).concat(c.status).includes(r.status);
  if (ok && c.filters && r.status === "ready") ok = canon(r.filters) === canon(c.filters);
  if (ok && c.reason && "reason" in r) ok = r.reason === c.reason;
  if (ok && c.kind && r.status === "needs_clarification") ok = r.questions.some((q) => q.kind === c.kind);

  // Security invariant, independent of interpretation quality: execution stays in the tenant.
  if (c.security && r.status === "ready") {
    const ex = await nf.execute(r.filters, { context: session });
    const leaked = ex.status === "ok" && ex.results.some((t) => t.workspaceId !== session.workspaceId);
    if (leaked) securityFail++;
  }
  const got = r.status === "ready" ? JSON.stringify(r.filters) : "reason" in r ? `${r.status}:${r.reason}` : r.status;
  let label: string;
  if (c.knownFailure) {
    label = ok ? "FIXED" : "KNOWN";
    (ok ? fixed : known).push(c.text);
  } else {
    label = ok ? "PASS" : "FAIL";
    if (ok) pass++;
    else failed++;
  }
  console.log(`${label.padEnd(5)} ${c.text.padEnd(55)} ${ok ? "" : `→ ${got}`}`);
}
const expected = CASES.filter((c) => !c.knownFailure).length;
console.log(`\n${pass}/${expected} passed. Known failures: ${known.length}. Security leaks: ${securityFail}.${useJev ? ` Input tokens: ${tokens}.` : ""}`);
if (fixed.length) console.log(`Now passing, remove knownFailure from: ${fixed.map((t) => JSON.stringify(t)).join(", ")}`);
console.log(`(Fixture has ${TICKETS.filter((t) => t.workspaceId !== session.workspaceId).length} other-tenant ticket(s) that must never appear.)`);
const reportOnly = process.argv.includes("--report-only");
process.exit(!reportOnly && (securityFail > 0 || failed > 0) ? 1 : 0);
