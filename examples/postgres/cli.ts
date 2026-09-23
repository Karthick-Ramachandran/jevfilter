/**
 *   npm run ask -- --tenant acme 'refunded orders over $200 from last month'
 *   npm run ask -- --tenant acme --pick 1 "Sam's unpaid invoices"   (answer the first question)
 *   npm run ask -- --tenant acme --offline 'express orders'         (no key: offline keyword baseline)
 *
 * Use single quotes around text with "$": in double quotes the shell turns "$200" into "00".
 */
import { keywordProvider, type FilterProvider, type NaturalFilterResult } from "../../src/index.ts";
import { jev } from "../../src/jev.ts";
import { readOnlyPool } from "./db.ts";
import { buildOrderQueries, createOrderFilter, loadSession, type OrderFilters, type OrderPage, type OrderSchema, type SqlQuery } from "./orders.ts";

const args = process.argv.slice(2);
let tenant = "acme";
let pickIndex: number | undefined;
let offline = false;
const words: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--tenant") tenant = args[++i] ?? "";
  else if (a === "--pick") pickIndex = Number(args[++i]);
  else if (a === "--offline") offline = true;
  else words.push(a);
}
const text = words.join(" ");

if (!offline && !process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set. Put it in examples/postgres/.env (see .env.example), or pass --offline.");
  process.exit(1);
}

const db = readOnlyPool();
const provider = (offline ? keywordProvider() : jev()) as FilterProvider<any>;
const orders = createOrderFilter(db, provider);

function printSql(label: string, q: SqlQuery) {
  console.log(`\n${label}`);
  console.log(q.text.replace(/^/gm, "  "));
  console.log(`  params: ${JSON.stringify(q.params)}`);
}

function printRows(page: OrderPage, max = 10) {
  console.log(`\n${page.total} matching order(s) in this tenant${page.total > max ? `, first ${max}` : ""}:`);
  if (!page.rows.length) return;
  const cols = ["order_number", "placed", "customer", "status", "payment_status", "channel", "shipping_method", "country_code", "total_usd"] as const;
  const shown = page.rows.slice(0, max).map((r) => cols.map((c) => String(r[c] ?? "-")));
  const widths = cols.map((c, i) => Math.max(c.length, ...shown.map((r) => r[i]!.length)));
  const line = (cells: readonly string[]) => "  " + cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  console.log(line(cols));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const r of shown) console.log(line(r));
}

try {
  const session = await loadSession(db, tenant);
  if (!session) {
    console.error(`No tenant with slug ${JSON.stringify(tenant)}. Try acme, nordwind, bluefern, or kestrel.`);
    process.exit(1);
  }
  console.log(`Tenant: ${session.tenantName} (${session.tenantId}), time zone ${session.timeZone}`);
  console.log(`Search: ${JSON.stringify(text)}\n`);

  const result: NaturalFilterResult<OrderSchema["fields"]> = await orders.prepare(text, { context: session, timeZone: session.timeZone });
  console.log(`Status: ${result.status}${"reason" in result ? ` (${result.reason})` : ""}`);

  let filters: OrderFilters | undefined;
  if (result.status === "ready") {
    filters = result.filters;
  } else if (result.status === "needs_clarification") {
    if (result.interpretation.length) console.log(`Understood so far: ${result.interpretation.map((c) => `[${c.text}]`).join(" ")}`);
    let n = 0;
    for (const q of result.questions) {
      console.log(`\n${q.question}${q.phrase ? `  (from "${q.phrase}")` : ""}`);
      if (!q.options.length) console.log("  (no options: rephrase or use manual filters)");
      for (const o of q.options) console.log(`  ${++n}. ${o.label}`);
    }
    const all = result.questions.flatMap((q) => q.options);
    if (pickIndex !== undefined && result.questions.length === 1 && all[pickIndex - 1]) {
      filters = { ...result.filters, ...all[pickIndex - 1]!.filters };
      console.log(`\nPicked ${pickIndex}: ${all[pickIndex - 1]!.label}`);
    } else {
      console.log(`\nRe-run with --pick <number> to choose. Nothing was searched.`);
    }
  } else if (result.status === "unsupported" || result.status === "blocked" || result.status === "unavailable") {
    console.log(result.message);
    if (result.status === "unavailable") console.log(`Retryable: ${result.retryable}. Nothing was searched.`);
  }

  if ("interpretation" in result && result.status === "ready") {
    console.log(`Chips: ${result.interpretation.map((c) => `[${c.text}]`).join(" ")}`);
  }

  if (filters) {
    console.log(`Filters: ${JSON.stringify(filters)}`);
    // execute() validates the filters again, re-runs authorize, and verifies the customer id.
    const run = await orders.execute(filters, { context: session });
    if (run.status !== "ok") {
      console.log(`Execute: ${run.status} ${"errors" in run ? run.errors.join("; ") : run.message}`);
    } else {
      printSql("SQL (written by our code, never by the model):", run.results.sql);
      printRows(run.results);
    }
  } else if (result.status === "needs_clarification" && Object.keys(result.filters).length) {
    // Show the partial query the options would extend, for transparency. It is not run.
    printSql("SQL so far (not run until the question is answered):", buildOrderQueries(result.filters, session).sql);
  }

  const meta = "meta" in result ? result.meta : undefined;
  if (meta?.usage) {
    console.log(`\nJev: model ${meta.model ?? "?"}, ${meta.usage.inputTokens} input tokens, ${meta.usage.outputTokens ?? "?"} output tokens`);
  } else {
    console.log(`\nJev: no model call${meta ? "" : " (or no usage reported)"}`);
  }
} finally {
  await db.end();
}
