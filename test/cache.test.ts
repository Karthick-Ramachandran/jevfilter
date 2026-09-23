import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTicketFilter, listTickets, ticketSearch, type Session } from "../examples/tickets/tickets.ts";
import { createNaturalFilter, memoryCache, mockProvider, withCache, type FilterProvider, type ProviderRequest } from "../src/index.ts";

/** Ticket filter over a cached provider, with a custom prepare() budget. */
function createNaturalFilterFor(provider: FilterProvider<Session>, opts: { timeoutMs: number }) {
  return createNaturalFilter({
    schema: ticketSearch,
    provider: withCache(provider, { store: memoryCache(), scope: (s) => s.workspaceId }),
    authorize: (s: Session) => s.canSearchTickets,
    executor: listTickets,
    timeoutMs: opts.timeoutMs,
  });
}

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

  it("doesn't pass one caller's failure to another caller waiting on the same call", async () => {
    let calls = 0;
    const base = counting().provider;
    const flaky: FilterProvider<Session> = {
      name: "flaky",
      async choose(req, o) {
        calls++;
        if (calls === 1) {
          await new Promise((r) => setTimeout(r, 20));
          throw new Error("first caller's deadline");
        }
        return base.choose(req, o);
      },
    };
    const nf = createTicketFilter(withCache(flaky, { store: memoryCache(), scope: (s) => s.workspaceId }));
    const [a, b] = await Promise.all([
      nf.prepare("urgent tickets", { context: acme, now }),
      nf.prepare("urgent tickets", { context: acme, now }),
    ]);
    assert.equal(a.status, "unavailable");
    assert.equal(b.status, "ready");
    assert.equal(calls, 2);
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

describe("withCache hardening (review findings)", () => {
  const ok = () => counting().provider;
  const wrap = (provider: FilterProvider<Session>, extra: Record<string, unknown> = {}) =>
    createTicketFilter(withCache(provider, { store: memoryCache(), scope: (s: Session) => s.workspaceId, ...extra } as never));

  it("1: refuses a scope that isn't a non-empty string instead of merging tenants", async () => {
    const c = counting();
    const store = memoryCache();
    const byObject = createTicketFilter(withCache(c.provider, { store, scope: (s) => ({ id: s.workspaceId }) as never }));
    const a = await byObject.prepare("urgent tickets", { context: acme, now });
    const b = await byObject.prepare("urgent tickets", { context: other, now });
    assert.equal(a.status, "unavailable");
    assert.equal(b.status, "unavailable");
    const missing = createTicketFilter(withCache(c.provider, { store, scope: () => undefined as never }));
    assert.equal((await missing.prepare("urgent tickets", { context: acme, now })).status, "unavailable");
    assert.equal(c.calls(), 0);
  });

  it("2: keeps shared:true apart from a tenant named \"shared\"", async () => {
    const store = memoryCache();
    const pub = counting();
    const ten = counting();
    await createTicketFilter(withCache(pub.provider, { store, shared: true })).prepare("urgent tickets", { context: acme, now });
    const r = await createTicketFilter(withCache(ten.provider, { store, scope: () => "shared" })).prepare("urgent tickets", { context: acme, now });
    assert.equal(ten.calls(), 1);
    assert.equal(r.status === "ready" && r.meta.cached, undefined);
  });

  it("3: a provider that hangs and ignores its signal doesn't block later searches", async () => {
    let calls = 0;
    const base = ok();
    const hangsOnce: FilterProvider<Session> = {
      name: "hangs-once",
      choose(req, o) {
        calls++;
        return calls === 1 ? new Promise(() => {}) : base.choose(req, o);
      },
    };
    const nf = createNaturalFilterFor(hangsOnce, { timeoutMs: 40 });
    assert.equal((await nf.prepare("urgent tickets", { context: acme, now })).status, "unavailable");
    assert.equal((await nf.prepare("urgent tickets", { context: acme, now })).status, "ready");
    assert.equal(calls, 2);
  });

  it("4: a hanging store is a miss on read and ignored on write", async () => {
    const hang = () => new Promise<never>(() => {});
    const c1 = counting();
    const readHangs = createTicketFilter(withCache(c1.provider, { store: { get: hang, set: () => {} }, scope: (s) => s.workspaceId, storeTimeoutMs: 20 }));
    assert.equal((await readHangs.prepare("urgent tickets", { context: acme, now })).status, "ready");
    const c2 = counting();
    const writeHangs = createTicketFilter(withCache(c2.provider, { store: { get: () => undefined, set: hang }, scope: (s) => s.workspaceId }));
    assert.equal((await writeHangs.prepare("urgent tickets", { context: acme, now })).status, "ready");
    assert.equal((await writeHangs.prepare("urgent tickets", { context: acme, now })).status, "ready");
  });

  it("5: rejects TTLs and sizes that aren't finite numbers", () => {
    const { provider } = counting();
    for (const ttlMs of [Number.NaN, Infinity, "600000", 0, -5]) {
      assert.throws(() => withCache(provider, { store: memoryCache(), shared: true, ttlMs: ttlMs as never }), /ttlMs/);
    }
    assert.throws(() => memoryCache({ maxEntries: Number.NaN }), /maxEntries/);
    assert.throws(() => memoryCache({ ttlMs: Number.NaN }), /ttlMs/);
    const store = memoryCache();
    store.set("k", { answers: {} }, Number.NaN);
    assert.equal(store.get("k"), undefined);
  });

  it("6: a waiting caller doesn't inherit the leader's incomplete answer", async () => {
    let calls = 0;
    const base = ok();
    const badFirst: FilterProvider<Session> = {
      name: "bad-first",
      async choose(req, o) {
        calls++;
        if (calls === 1) {
          await new Promise((r) => setTimeout(r, 20));
          return { answers: { intent: { choice: "nonsense", probabilities: {} } } };
        }
        return base.choose(req, o);
      },
    };
    const nf = wrap(badFirst);
    const [a, b] = await Promise.all([
      nf.prepare("urgent tickets", { context: acme, now }),
      nf.prepare("urgent tickets", { context: acme, now }),
    ]);
    assert.equal(a.status, "unavailable");
    assert.equal(b.status, "ready");
  });

  it("7: after a leader fails, one waiting caller takes over and its answer is cached", async () => {
    let calls = 0;
    const base = ok();
    const failFirst: FilterProvider<Session> = {
      name: "fail-first",
      async choose(req, o) {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        if (calls === 1) throw new Error("503");
        return base.choose(req, o);
      },
    };
    const nf = wrap(failFirst);
    const results = await Promise.all(Array.from({ length: 6 }, () => nf.prepare("urgent tickets", { context: acme, now })));
    assert.equal(results.filter((r) => r.status === "ready").length, 5);
    assert.equal(calls, 2);
    const after = await nf.prepare("urgent tickets", { context: acme, now });
    assert.equal(after.status === "ready" && after.meta.cached, true);
    assert.equal(calls, 2);
  });

  it("returns copies, so a caller mutating an answer can't change the cache", async () => {
    const c = counting();
    const store = memoryCache();
    const provider = withCache(c.provider, { store, shared: true });
    const req = { state: { search_request: "urgent tickets" }, questions: { intent: { instructions: "?", options: { filter: null, other: null } } } };
    const signal = new AbortController().signal;
    const first = await provider.choose(req, { context: acme, signal });
    const hit = await provider.choose(req, { context: acme, signal });
    hit.answers.intent!.choice = "other";
    const again = await provider.choose(req, { context: acme, signal });
    assert.equal(first.answers.intent!.choice, "filter");
    assert.equal(again.answers.intent!.choice, "filter");
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
