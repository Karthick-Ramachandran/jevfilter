import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNaturalFilter, defineSearch, enumField } from "../src/index.ts";
import { jev } from "../src/jev.ts";

const schema = defineSearch({ resource: "tickets", fields: { status: enumField(["open", "closed"]) } });

interface Ctx {
  jevKey?: string;
}

/** Fake Jev API: records auth headers, answers "open" to everything. */
function fakeApi(status = 200) {
  const seen: { auth: string | null; body: any }[] = [];
  const fetch = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ auth: new Headers(init?.headers).get("authorization"), body });
    if (status !== 200) return new Response(JSON.stringify({ error: "nope" }), { status });
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries<any>(body.questions)) {
      const labels = Object.keys(q.criteria);
      const choice: string = id === "intent" ? "filter" : (labels.find((l) => l === 'is "open"') ?? labels[0]!);
      answers[id] = { type: "choice", choice, confidence: 0.9, probabilities: { [choice]: 0.95 } };
    }
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 5 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, seen };
}

describe("jev provider", () => {
  it("sends each tenant's own key (bring your own key)", async () => {
    const api = fakeApi();
    const nf = createNaturalFilter({
      schema,
      allowUnauthenticated: true,
      provider: jev<Ctx>({ apiKey: (ctx) => ctx.jevKey ?? "", fetch: api.fetch, maxRetries: 0 }),
    });
    const a = await nf.prepare("open tickets", { context: { jevKey: "key-tenant-a" } });
    const b = await nf.prepare("open tickets", { context: { jevKey: "key-tenant-b" } });
    assert.deepEqual(a.status === "ready" && a.filters, { status: "open" });
    assert.equal(b.status, "ready");
    assert.deepEqual(api.seen.map((s) => s.auth), ["Bearer key-tenant-a", "Bearer key-tenant-b"]);
    assert.equal(a.status === "ready" && a.meta.model, "jev-1.13.0");
    // Pinned model and state/instructions separation on the wire.
    assert.equal(api.seen[0]!.body.model, "jev-1.13.0");
    assert.deepEqual(api.seen[0]!.body.state, { search_request: "open tickets" });
  });

  it("returns unavailable (not retryable) when a tenant has no key, without calling the API", async () => {
    const api = fakeApi();
    const nf = createNaturalFilter({ schema, allowUnauthenticated: true, provider: jev<Ctx>({ apiKey: (ctx) => ctx.jevKey ?? "", fetch: api.fetch }) });
    const r = await nf.prepare("open tickets", { context: {} });
    assert.deepEqual(r.status === "unavailable" && [r.reason, r.retryable], ["provider_error", false]);
    assert.equal(api.seen.length, 0);
  });

  it("maps a rejected key to a non-retryable error that does not echo the key", async () => {
    const api = fakeApi(401);
    let logged: unknown;
    const nf = createNaturalFilter({
      schema,
      allowUnauthenticated: true,
      provider: jev({ apiKey: "sk-secret-123", fetch: api.fetch, maxRetries: 0 }),
      onError: (e) => (logged = e),
    });
    const r = await nf.prepare("open tickets");
    assert.deepEqual(r.status === "unavailable" && [r.reason, r.retryable], ["provider_error", false]);
    assert.ok(!JSON.stringify(r).includes("sk-secret"));
    assert.ok(!String((logged as Error).message).includes("sk-secret"));
  });

  it("marks server errors retryable", async () => {
    const nf = createNaturalFilter({ schema, allowUnauthenticated: true, provider: jev({ apiKey: "k", fetch: fakeApi(503).fetch, maxRetries: 0 }) });
    const r = await nf.prepare("open tickets");
    assert.equal(r.status === "unavailable" && r.retryable, true);
  });
});
