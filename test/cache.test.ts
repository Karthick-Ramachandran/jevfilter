import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTicketFilter, type Session } from "../examples/tickets/tickets.ts";
import { memoryCache, mockProvider, withCache, type FilterProvider, type ProviderRequest } from "../src/index.ts";

const now = new Date("2026-09-23T10:00:00Z");
const acme: Session = { userId: "u1", workspaceId: "ws_acme", canSearchTickets: true };
const other: Session = { userId: "u2", workspaceId: "ws_other", canSearchTickets: true };

/** Counts real provider calls. Answers: priority high, date → createdAt, customer "Priya" when named. */
function counting(opts: { fail?: number; invalid?: boolean } = {}) {
  let calls = 0;
  const base = mockProvider(({ id, question }) => {
    if (id === "intent") return "filter";
    if (id === "field_priority") return { choice: 'is "high"', probability: 0.97 };
    if (id.startsWith("field_")) return "unspecified";
    if (id.startsWith("entity_")) return Object.keys(question.options).find((l) => question.options[l] === '"Priya"') ?? "none";
    return Object.keys(question.options)[0];
  });
  const provider: FilterProvider<Session> = {
    name: "counting",
    model: "m-1",
    async choose(req: ProviderRequest, o) {
      calls++;
      if (opts.fail && calls <= opts.fail) throw new Error("boom");
      if (opts.invalid) return { answers: { intent: { choice: "nonsense", probabilities: {} } } };
      return { ...(await base.choose(req, o)), usage: { inputTokens: 2000 } };
    },
  };
  return { provider, calls: () => calls };
}

describe("withCache", () => {
  it("serves a repeat search from cache with 0 tokens and the same filters", async () => {
    const c = counting();
    const nf = createTicketFilter(withCache(c.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    const a = await nf.prepare("urgent tickets", { context: acme, now });
    const b = await nf.prepare("urgent tickets", { context: acme, now });
    assert.equal(c.calls(), 1);
    assert.deepEqual(a.status === "ready" && a.filters, { priority: "high" });
    assert.deepEqual(b.status === "ready" && b.filters, { priority: "high" });
    assert.equal(b.status === "ready" && b.meta.cached, true);
    assert.equal(b.status === "ready" && b.meta.usage?.inputTokens, 0);
    assert.equal(a.status === "ready" && a.meta.cached, undefined);
  });

  it("keeps tenants apart", async () => {
    const c = counting();
    const nf = createTicketFilter(withCache(c.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    await nf.prepare("urgent tickets", { context: acme, now });
    await nf.prepare("urgent tickets", { context: other, now });
    assert.equal(c.calls(), 2);
  });

  it("still runs authorize on a cache hit", async () => {
    const c = counting();
    const nf = createTicketFilter(withCache(c.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    await nf.prepare("urgent tickets", { context: acme, now });
    const r = await nf.prepare("urgent tickets", { context: { ...acme, canSearchTickets: false }, now });
    assert.equal(r.status, "blocked");
  });

  it("still resolves entities and recomputes dates on a cache hit", async () => {
    const c = counting();
    const nf = createTicketFilter(withCache(c.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    const a = await nf.prepare("Priya's tickets from last week", { context: acme, now });
    const later = new Date("2026-10-07T10:00:00Z");
    const b = await nf.prepare("Priya's tickets from last week", { context: acme, now: later });
    assert.equal(c.calls(), 1);
    assert.deepEqual(a.status === "ready" && a.filters.createdAt, { gte: "2026-09-14", lt: "2026-09-21" });
    assert.deepEqual(b.status === "ready" && b.filters.createdAt, { gte: "2026-09-28", lt: "2026-10-05" });
    assert.equal(b.status === "ready" && b.filters.customer, "cus_4");
  });

  it("never caches failures or invalid answers", async () => {
    const failing = counting({ fail: 1 });
    const nf = createTicketFilter(withCache(failing.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    assert.equal((await nf.prepare("urgent tickets", { context: acme, now })).status, "unavailable");
    assert.equal((await nf.prepare("urgent tickets", { context: acme, now })).status, "ready");
    assert.equal(failing.calls(), 2);

    const invalid = counting({ invalid: true });
    const nf2 = createTicketFilter(withCache(invalid.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    await nf2.prepare("urgent tickets", { context: acme, now });
    await nf2.prepare("urgent tickets", { context: acme, now });
    assert.equal(invalid.calls(), 2);
  });

  it("shares one call between identical concurrent searches", async () => {
    const c = counting();
    const nf = createTicketFilter(withCache(c.provider, { store: memoryCache(), scope: (s) => s.workspaceId }));
    const [a, b] = await Promise.all([
      nf.prepare("urgent tickets", { context: acme, now }),
      nf.prepare("urgent tickets", { context: acme, now }),
    ]);
    assert.equal(c.calls(), 1);
    assert.equal(a.status, "ready");
    assert.equal(b.status, "ready");
  });

  it("changes the key when the model changes", async () => {
    const store = memoryCache();
    const c1 = counting();
    const c2 = counting();
    const p2 = { ...c2.provider, model: "m-2" };
    await createTicketFilter(withCache(c1.provider, { store, shared: true })).prepare("urgent tickets", { context: acme, now });
    await createTicketFilter(withCache(p2, { store, shared: true })).prepare("urgent tickets", { context: acme, now });
    assert.equal(c2.calls(), 1);
  });

  it("requires an explicit scope", () => {
    const { provider } = counting();
    assert.throws(() => withCache(provider, { store: memoryCache() } as never), /scope/);
  });

  it("survives a broken store", async () => {
    const c = counting();
    const broken = { get: () => { throw new Error("redis down"); }, set: () => { throw new Error("redis down"); } };
    const nf = createTicketFilter(withCache(c.provider, { store: broken, scope: (s) => s.workspaceId }));
    assert.equal((await nf.prepare("urgent tickets", { context: acme, now })).status, "ready");
  });
});

describe("memoryCache", () => {
  it("expires entries and evicts the least recently used", async () => {
    const store = memoryCache({ maxEntries: 2 });
    const v = { answers: {} };
    store.set("a", v, 60_000);
    store.set("b", v, 60_000);
    store.get("a"); // a is now most recent
    store.set("c", v, 60_000); // evicts b
    assert.ok(store.get("a"));
    assert.equal(store.get("b"), undefined);
    store.set("d", v, -1); // already expired
    assert.equal(store.get("d"), undefined);
  });
});
