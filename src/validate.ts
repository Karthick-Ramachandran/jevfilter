/**
 * Strict validation of filter objects. `execute()` treats filters as untrusted client input,
 * so this is the gate that keeps them within what the schema allows (ADR-0002).
 */
import type { Fields, Filters, NumberRange, SearchSchema } from "./schema.ts";

export type ValidationResult<F extends Fields> =
  | { ok: true; filters: Filters<F> }
  | { ok: false; errors: string[] };

const NUMBER_OPS = new Set(["eq", "gt", "gte", "lt", "lte"]);
const DATE_OPS = new Set(["gte", "lt"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** True when some number satisfies every bound in `r`. */
export function isSatisfiable(r: NumberRange): boolean {
  let lo = -Infinity;
  let loStrict = false;
  let hi = Infinity;
  let hiStrict = false;
  if (r.gte !== undefined) lo = r.gte;
  if (r.gt !== undefined && r.gt >= lo) {
    lo = r.gt;
    loStrict = true;
  }
  if (r.lte !== undefined) hi = r.lte;
  if (r.lt !== undefined && r.lt <= hi) {
    hi = r.lt;
    hiStrict = true;
  }
  if (r.eq !== undefined) {
    return (loStrict ? r.eq > lo : r.eq >= lo) && (hiStrict ? r.eq < hi : r.eq <= hi);
  }
  return lo < hi || (lo === hi && !loStrict && !hiStrict);
}

/**
 * Validate and copy `input`. Unknown fields, unknown operators, values outside an enum,
 * non-finite numbers, impossible ranges and malformed dates are all rejected.
 * The returned object is a fresh copy that holds only validated keys.
 */
export function validateFilters<F extends Fields>(
  schema: SearchSchema<F>,
  input: unknown,
): ValidationResult<F> {
  if (!isPlainObject(input)) return { ok: false, errors: ["filters must be a plain object"] };
  const errors: string[] = [];
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(schema.fields, key)) {
      errors.push(`unknown field: ${JSON.stringify(key).slice(0, 80)}`);
      continue;
    }
    const field = schema.fields[key]!;
    const v = input[key];
    const bad = (why: string) => errors.push(`${key}: ${why}`);

    switch (field.kind) {
      case "enum": {
        const allowed = (x: unknown): x is string =>
          typeof x === "string" && Object.prototype.hasOwnProperty.call(field.values, x);
        if (allowed(v)) out[key] = v;
        else if (isPlainObject(v) && Object.keys(v).length === 1 && allowed(v.not)) out[key] = { not: v.not };
        else bad("must be one of the allowed values, or { not: value }");
        break;
      }
      case "boolean":
        if (typeof v === "boolean") out[key] = v;
        else bad("must be true or false");
        break;
      case "number": {
        if (!isPlainObject(v) || Object.keys(v).length === 0) {
          bad("must be a range like { lt: 500 }");
          break;
        }
        const r: Record<string, number> = {};
        let ok = true;
        for (const [op, n] of Object.entries(v)) {
          if (!NUMBER_OPS.has(op) || typeof n !== "number" || !Number.isFinite(n)) ok = false;
          else r[op] = n;
        }
        if (!ok) bad("allowed operators are eq, gt, gte, lt, lte with finite numbers");
        else if (!isSatisfiable(r)) bad("range can never match");
        else out[key] = r;
        break;
      }
      case "date": {
        if (!isPlainObject(v) || Object.keys(v).length === 0) {
          bad('must be a range like { gte: "2026-09-01", lt: "2026-10-01" }');
          break;
        }
        const r: Record<string, string> = {};
        let ok = true;
        for (const [op, d] of Object.entries(v)) {
          if (!DATE_OPS.has(op) || !isIsoDate(d)) ok = false;
          else r[op] = d;
        }
        if (!ok) bad("allowed operators are gte and lt with YYYY-MM-DD dates");
        else if (r.gte && r.lt && r.gte >= r.lt) bad("range can never match");
        else out[key] = r;
        break;
      }
      case "entity":
        if (typeof v === "string" && v.length > 0 && v.length <= 256) out[key] = v;
        else bad("must be a non-empty id string");
        break;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, filters: out as Filters<F> };
}
