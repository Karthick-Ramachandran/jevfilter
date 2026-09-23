import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDates, parseNumbers, todayIn } from "../src/parse.ts";

// Wednesday, 23 September 2026.
const now = new Date("2026-09-23T10:00:00Z");
const d = (text: string, tz = "UTC") => parseDates(text, { now, timeZone: tz }).map((c) => c.range ?? "ambiguous");

describe("parseDates", () => {
  it("resolves calendar periods, not rolling windows", () => {
    assert.deepEqual(d("tickets from last week"), [{ gte: "2026-09-14", lt: "2026-09-21" }]);
    assert.deepEqual(d("created last month"), [{ gte: "2026-08-01", lt: "2026-09-01" }]);
    assert.deepEqual(d("this month"), [{ gte: "2026-09-01", lt: "2026-10-01" }]);
    assert.deepEqual(d("last quarter"), [{ gte: "2026-04-01", lt: "2026-07-01" }]);
    assert.deepEqual(d("last year"), [{ gte: "2025-01-01", lt: "2026-01-01" }]);
  });

  it("honours weekStartsOn", () => {
    const r = parseDates("this week", { now, timeZone: "UTC", weekStartsOn: 0 });
    assert.deepEqual(r[0]!.range, { gte: "2026-09-20", lt: "2026-09-27" });
  });

  it("handles rolling windows and single days", () => {
    assert.deepEqual(d("last 7 days"), [{ gte: "2026-09-17", lt: "2026-09-24" }]);
    assert.deepEqual(d("past week"), [{ gte: "2026-09-17", lt: "2026-09-24" }]);
    assert.deepEqual(d("yesterday"), [{ gte: "2026-09-22", lt: "2026-09-23" }]);
    assert.deepEqual(d("today"), [{ gte: "2026-09-23", lt: "2026-09-24" }]);
  });

  it("applies prepositions", () => {
    assert.deepEqual(d("issues before yesterday"), [{ lt: "2026-09-22" }]);
    assert.deepEqual(d("since 2026-09-01"), [{ gte: "2026-09-01" }]);
    assert.deepEqual(d("after 2026-09-01"), [{ gte: "2026-09-02" }]);
    assert.deepEqual(d("in august"), [{ gte: "2026-08-01", lt: "2026-09-01" }]);
    assert.deepEqual(d("from 2026-09-01 to 2026-09-10"), [{ gte: "2026-09-01", lt: "2026-09-11" }]);
  });

  it("uses the most recent past occurrence when the year is missing", () => {
    assert.deepEqual(d("on sep 14"), [{ gte: "2026-09-14", lt: "2026-09-15" }]);
    assert.deepEqual(d("on 30 september"), [{ gte: "2025-09-30", lt: "2025-10-01" }]);
    assert.deepEqual(d("in december"), [{ gte: "2025-12-01", lt: "2026-01-01" }]);
  });

  it("flags ambiguous numeric dates instead of guessing", () => {
    assert.deepEqual(d("on 03/04/2026"), ["ambiguous"]);
    assert.deepEqual(d("on 23/09/2026"), [{ gte: "2026-09-23", lt: "2026-09-24" }]);
  });

  it("ignores invalid dates and the verb 'may'", () => {
    assert.deepEqual(d("on 2026-02-30"), []);
    assert.deepEqual(d("tickets that may be urgent"), []);
  });

  it("computes today in the request timezone", () => {
    const late = new Date("2026-09-23T20:00:00Z");
    assert.equal(todayIn(late, "Asia/Kolkata"), "2026-09-24");
    assert.equal(todayIn(late, "America/Los_Angeles"), "2026-09-23");
  });
});

describe("parseNumbers", () => {
  const n = (text: string) => parseNumbers(text).map(({ range, unit, text }) => ({ range, unit, text }));

  it("parses comparators in code", () => {
    assert.deepEqual(n("tickets under $500"), [{ range: { lt: 500 }, unit: "USD", text: "under $500" }]);
    assert.deepEqual(n("at most 500 USD")[0]!.range, { lte: 500 });
    assert.deepEqual(n("over 2k")[0]!.range, { gt: 2000 });
    assert.deepEqual(n("at least 3 replies")[0]!.range, { gte: 3 });
    assert.deepEqual(n("100 or more")[0]!.range, { gte: 100 });
    assert.deepEqual(n("3 replies")[0]!.range, { eq: 3 });
  });

  it("parses ranges and grouping", () => {
    assert.deepEqual(n("between 100 and 500")[0]!.range, { gte: 100, lte: 500 });
    assert.deepEqual(n("under ₹5,00,000")[0], { range: { lt: 500000 }, unit: "INR", text: "under ₹5,00,000" });
    assert.deepEqual(n("under INR 5,000")[0]!.range, { lt: 5000 });
    assert.deepEqual(n("above 12.5")[0]!.range, { gt: 12.5 });
  });

  it("does not read identifiers or date parts as numbers", () => {
    assert.deepEqual(n("P1 tickets"), []);
    const dates = parseDates("since 2026-09-01 under $50", { now, timeZone: "UTC" });
    assert.deepEqual(parseNumbers("since 2026-09-01 under $50", dates).map((c) => c.range), [{ lt: 50 }]);
  });
});
