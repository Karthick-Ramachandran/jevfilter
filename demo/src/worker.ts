/**
 * JevFilter demo Worker (ADR-0006).
 *
 *   POST /api/search   { text, account }  → interpret with Jev, then run the scoped search
 *   POST /api/execute  { filters, account } → validated filters only (chips, clarifications)
 *   GET  /api/meta                          → accounts, fields, today
 *
 * The Jev key is `env.TYPESAFE_API_KEY` (a Worker secret) or the visitor's own key from the
 * `x-jev-api-key` header. It is never logged, stored, or returned.
 */
import {
  createNaturalFilter,
  parseDates,
  parseNumbers,
  type FilterProvider,
  type ProviderResponse,
} from "../../src/index.ts";
import { jev } from "../../src/jev.ts";
import { ACCOUNTS, dataset, helpdesk, listTickets, type Account, type Session, type Ticket } from "./data.ts";
import { listProducts, shop } from "./shop.ts";

interface Env {
  ASSETS: Fetcher;
  IP_LIMITER: RateLimit;
  GLOBAL_LIMITER: RateLimit;
  TYPESAFE_API_KEY?: string;
  DEMO_DISABLED?: string;
}

type Ctx = Session & { jevKey: string };

/** Jev input price per token, from TypeSafe's model page (USD 0.042 per million). */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// Built once per isolate. The key comes from each request's context, never from module scope.
const provider = jev<Ctx>({ apiKey: (ctx) => ctx.jevKey, maxRetries: 1, timeout: 4_000 });

interface TraceEntry {
  id: string;
  question: string;
  choice: string;
  top: { label: string; p: number }[];
}

/** Wraps the provider to record what Jev was asked and answered (for the X-ray panel). */
function traced(inner: FilterProvider<Ctx>, trace: TraceEntry[]): FilterProvider<Ctx> {
  return {
    name: inner.name,
    async choose(request, options) {
      const res: ProviderResponse = await inner.choose(request, options);
      for (const [id, spec] of Object.entries(request.questions)) {
        const a = res.answers[id];
        if (!a) continue;
        const probs = Object.entries(a.probabilities ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 4);
        // Entity options are labelled "phrase 1", "phrase 2"; show the words from the request instead.
        const show = (label: string) => (/^phrase \d+$/.test(label) ? `phrase ${spec.options[label] ?? ""}` : label);
        trace.push({
          id,
          // First line only: the full instructions include the field list.
          question: spec.instructions.split("\n")[0]!.slice(0, 220),
          choice: show(a.choice),
          top: probs.map(([label, p]) => ({ label: show(label), p: Math.round(p * 1000) / 1000 })),
        });
      }
      return res;
    },
  };
}

function accountFrom(body: { account?: unknown }): Account | undefined {
  return ACCOUNTS.find((a) => a.id === body.account);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 8 * 1024) throw new Error("too large");
  const v = JSON.parse(text || "{}");
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function publicRow(t: Ticket) {
  const { id, subject, status, priority, category, channel, escalated, amount, createdAt, customer, company } = t;
  return { id, subject, status, priority, category, channel, escalated, amount, createdAt, customer, company };
}

function searchResponse(account: Account, now: Date, filters: Parameters<typeof listTickets>[0]) {
  const { rows, total } = listTickets(filters, { account, now });
  return {
    rows: rows.map(publicRow),
    total,
    // Demonstrates the boundary: counted over what the executor actually returned.
    leakedRows: rows.filter((r) => r.company !== account.id).length,
  };
}

/**
 * The visitor's own key (x-jev-api-key) if sent, else the shared secret behind the rate limits
 * (ADR-0006). The value only ever goes into a request context, never into a response.
 */
async function jevKeyFor(req: Request, env: Env): Promise<{ value: string; own: boolean } | { error: Response }> {
  const header = req.headers.get("x-jev-api-key")?.trim();
  if (header && header.length <= 512) return { value: header, own: true };
  // Shared key: 10/min per IP plus a 30/min global spend cap (ADR-0006).
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const [perIp, global] = await Promise.all([env.IP_LIMITER.limit({ key: ip }), env.GLOBAL_LIMITER.limit({ key: "all" })]);
  if (!perIp.success || !global.success) {
    return { error: json({ error: "The shared demo key is busy. Wait a minute, or paste your own Jev key." }, 429) };
  }
  if (!env.TYPESAFE_API_KEY) return { error: json({ error: "The demo has no Jev key configured. Paste your own key to try it." }, 503) };
  return { value: env.TYPESAFE_API_KEY, own: false };
}

type ShopCtx = { jevKey: string };
const shopProvider = jev<ShopCtx>({ apiKey: (ctx) => ctx.jevKey, maxRetries: 1, timeout: 4_000 });

/** The simple store demo: one model call, then the store's own product query. */
async function handleShopSearch(req: Request, env: Env): Promise<Response> {
  if (env.DEMO_DISABLED === "1") return json({ error: "The live demo is paused. Try again later." }, 503);
  const body = await readBody(req);
  const key = await jevKeyFor(req, env);
  if ("error" in key) return key.error;
  const nf = createNaturalFilter({ schema: shop, provider: shopProvider, timeoutMs: 9_000 });
  const started = Date.now();
  const result = await nf.prepare(String(body.text ?? ""), { context: { jevKey: key.value } });
  const usage = "meta" in result ? result.meta?.usage : undefined;
  return json({
    result,
    products: result.status === "ready" ? listProducts(result.filters) : null,
    stats: {
      ms: Date.now() - started,
      inputTokens: usage?.inputTokens ?? 0,
      estimatedUsd: usage ? Math.round(usage.inputTokens * USD_PER_INPUT_TOKEN * 1e6) / 1e6 : 0,
      modelCalls: usage ? 1 : 0,
    },
  });
}

/** Chip removal and manual edits: validated filters only, no model call. */
async function handleShopExecute(req: Request): Promise<Response> {
  const body = await readBody(req);
  const nf = createNaturalFilter({ schema: shop, provider: shopProvider, executor: (f) => listProducts(f), allowEmptyFilters: true });
  const r = await nf.execute(body.filters, { context: { jevKey: "" } });
  return json(r.status === "ok" ? { status: "ok", filters: r.filters, products: r.results } : r, r.status === "ok" ? 200 : 400);
}

async function handleSearch(req: Request, env: Env): Promise<Response> {
  if (env.DEMO_DISABLED === "1") return json({ error: "The live demo is paused. Try again later." }, 503);
  const body = await readBody(req);
  const account = accountFrom(body);
  if (!account) return json({ error: "Unknown demo account." }, 400);

  const key = await jevKeyFor(req, env);
  if ("error" in key) return key.error;
  const ownKey = key.own ? key.value : undefined;

  const now = new Date();
  const text = String(body.text ?? "");
  const trace: TraceEntry[] = [];
  const nf = createNaturalFilter({
    schema: helpdesk,
    provider: traced(provider, trace),
    authorize: () => true, // every demo account may search its own tickets
    timeZone: "UTC",
    timeoutMs: 9_000,
  });
  const context: Ctx = { account, now, jevKey: key.value };
  const started = Date.now();
  const result = await nf.prepare(text, { context, now });
  const ms = Date.now() - started;

  const dates = parseDates(text.slice(0, 500), { now, timeZone: "UTC" });
  const numbers = parseNumbers(text.slice(0, 500), dates);
  const usage = "meta" in result ? result.meta?.usage : undefined;

  return json({
    result,
    search: result.status === "ready" ? searchResponse(account, now, result.filters) : null,
    xray: {
      parsed: [
        ...dates.map((d) => ({ kind: "date", text: d.text, value: d.range ?? "ambiguous" })),
        ...numbers.map((n) => ({ kind: "number", text: n.text, value: n.range, unit: n.unit ?? null })),
      ],
      questions: trace,
      usage: usage ? { ...usage, estimatedUsd: Math.round(usage.inputTokens * USD_PER_INPUT_TOKEN * 1e6) / 1e6 } : null,
      model: "meta" in result ? (result.meta?.model ?? null) : null,
      ms,
      keySource: ownKey ? "yours" : "shared demo key",
      sqlGenerated: null,
    },
  });
}

async function handleExecute(req: Request): Promise<Response> {
  const body = await readBody(req);
  const account = accountFrom(body);
  if (!account) return json({ error: "Unknown demo account." }, 400);
  const now = new Date();
  // No model call: filters from the browser are validated like any untrusted input.
  const nf = createNaturalFilter({
    schema: helpdesk,
    provider: provider, // unused by execute
    authorize: () => true,
    executor: (f, s: Ctx) => searchResponse(s.account, s.now, f),
  });
  const r = await nf.execute(body.filters, { context: { account, now, jevKey: "" } });
  return json(r.status === "ok" ? { status: "ok", filters: r.filters, search: r.results } : r, r.status === "ok" ? 200 : 400);
}

function handleMeta(): Response {
  const now = new Date();
  const d = dataset(now);
  return json({
    today: d.today,
    accounts: ACCOUNTS.map((a) => ({ ...a, tickets: d.tickets.filter((t) => t.company === a.id).length })),
    fields: Object.fromEntries(
      Object.entries(helpdesk.fields).map(([k, f]) => [k, { kind: f.kind, ...(f.kind === "enum" ? { values: Object.keys(f.values) } : {}) }]),
    ),
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/meta" && req.method === "GET") return handleMeta();
      if (url.pathname === "/api/search" && req.method === "POST") return await handleSearch(req, env);
      if (url.pathname === "/api/execute" && req.method === "POST") return await handleExecute(req);
      if (url.pathname === "/api/shop/search" && req.method === "POST") return await handleShopSearch(req, env);
      if (url.pathname === "/api/shop/execute" && req.method === "POST") return await handleShopExecute(req);
      if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
      return env.ASSETS.fetch(req);
    } catch {
      // Never echo internals (or a key) back to the browser.
      return json({ error: "Bad request." }, 400);
    }
  },
} satisfies ExportedHandler<Env>;
