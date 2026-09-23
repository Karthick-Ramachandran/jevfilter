import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNaturalFilter, defineSearch, enumField, memoryCache, mockProvider, withCache, type FilterProvider } from "../../src/index.ts";
import { KV_MIN_TTL_SECONDS, kvStore, pendingWrites, tieredStore, type KvLike } from "../src/kv-cache.ts";

/** In-memory stand-in for a KV namespace, with switches for failure modes. */
function fakeKv() {
  const data = new Map<string, string>();
  const puts: { key: string; ttl?: number }[] = [];
  const kv = {
    mode: "ok" as "ok" | "throw" | "hang" | "reject-writes",
    data,
    puts,
    async get(key: string) {
      if (kv.mode === "throw") throw new Error("kv down");
      if (kv.mode === "hang") return new Promise(() => {});
      const v = data.get(key);
      return v === undefined ? null : JSON.parse(v);
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      if (kv.mode === "reject-writes" || kv.mode === "throw") throw new Error("kv write failed");
      puts.push({ key, ttl: opts?.expirationTtl });
      data.set(key, value);
    },
  };
  return kv;
}

const schema = defineSearch({ resource: "tickets", fields: { status: enumField(["open", "closed"]) } });

/** Counts real model calls; always answers "status is open". */
function counting() {
  let calls = 0;
  const base = mockProvider(({ id, question }) => (id === "intent" ? "filter" : id === "field_status" ? 'is "open"' : Object.keys(question.options)[0]));
  const provider: FilterProvider<{ tenant: string }> = { name: "counting", model: "m1", async choose(r, o) { calls++; return base.choose(r, o); } };
  return { provider, calls: () => calls };
}

/** One "isolate": its own memory level, sharing the given KV. */
function isolate(kv: KvLike | undefined, provider: FilterProvider<{ tenant: string }>, storeTimeoutMs?: number) {
  return createNaturalFilter({
    schema,
    provider: withCache(provider, { store: tieredStore(kvStore(() => kv), memoryCache()), scope: (c) => c.tenant, ...(storeTimeoutMs ? { storeTimeoutMs } : {}) }),
    allowUnauthenticated: true,
  });
}

const settle = () => Promise.allSettled([...pendingWrites]);
const acme = { context: { tenant: "acme" } };

describe("Workers KV answer cache", () => {
  it("shares answers between isolates through KV", async () => {
    const kv = fakeKv();
    const c = counting();
    const a = await isolate(kv, c.provider).prepare("open tickets", acme);
    await settle();
    const b = await isolate(kv, c.provider).prepare("open tickets", acme); // fresh memory, same KV
    assert.equal(c.calls(), 1);
    assert.equal(a.status === "ready" && a.meta.cached, undefined);
    assert.equal(b.status === "ready" && b.meta.cached, true);
    assert.deepEqual(b.status === "ready" && b.filters, { status: "open" });
  });

  it("keeps tenants apart in KV", async () => {
    const kv = fakeKv();
    const c = counting();
    await isolate(kv, c.provider).prepare("open tickets", acme);
    await settle();
    await isolate(kv, c.provider).prepare("open tickets", { context: { tenant: "globex" } });
    assert.equal(c.calls(), 2);
  });

  it("writes with a prefix, a TTL of at least 60 s, and no search text", async () => {
    const kv = fakeKv();
    await isolate(kv, counting().provider).prepare("open tickets", acme);
    await settle();
    assert.equal(kv.puts.length, 1);
    assert.match(kv.puts[0]!.key, /^jf:answers:v1:[0-9a-f]{64}$/);
    assert.ok(kv.puts[0]!.ttl! >= KV_MIN_TTL_SECONDS);
    const stored = [...kv.data.values()][0]!;
    assert.ok(!stored.includes("open tickets"));
    assert.ok(JSON.parse(stored).answers);
  });

  it("raises a TTL below KV's minimum to 60 s", () => {
    const kv = fakeKv();
    kvStore(() => kv).set("k", { answers: {} }, 5_000);
    assert.equal(kv.puts[0]?.ttl, KV_MIN_TTL_SECONDS);
  });

  it("keeps searching when KV reads throw", async () => {
    const kv = fakeKv();
    kv.mode = "throw";
    const r = await isolate(kv, counting().provider).prepare("open tickets", acme);
    assert.equal(r.status, "ready");
  });

  it("keeps searching when KV reads hang", async () => {
    const kv = fakeKv();
    kv.mode = "hang";
    const started = Date.now();
    const r = await isolate(kv, counting().provider, 50).prepare("open tickets", acme);
    assert.equal(r.status, "ready");
    assert.ok(Date.now() - started < 2_000);
  });

  it("keeps searching when KV writes fail, and still caches in memory", async () => {
    const kv = fakeKv();
    kv.mode = "reject-writes";
    const c = counting();
    const nf = isolate(kv, c.provider);
    assert.equal((await nf.prepare("open tickets", acme)).status, "ready");
    await settle();
    const again = await nf.prepare("open tickets", acme);
    assert.equal(again.status === "ready" && again.meta.cached, true);
    assert.equal(c.calls(), 1);
    assert.equal(pendingWrites.size, 0);
  });

  it("treats junk in KV as a miss", async () => {
    const kv = fakeKv();
    const store = kvStore(() => kv);
    for (const junk of ["not answers", 42, null, { foo: 1 }, { answers: "x" }, { answers: null }]) {
      kv.data.set("jf:answers:v1:k", JSON.stringify(junk));
      assert.equal(await store.get("k"), undefined, `accepted junk ${JSON.stringify(junk)}`);
    }
  });

  it("works as memory-only when the KV binding is missing", async () => {
    const c = counting();
    const nf = isolate(undefined, c.provider);
    await nf.prepare("open tickets", acme);
    const again = await nf.prepare("open tickets", acme);
    assert.equal(again.status === "ready" && again.meta.cached, true);
    assert.equal(c.calls(), 1);
  });
});
