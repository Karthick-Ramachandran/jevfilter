/**
 * createNaturalFilter: natural language → validated, typed filters.
 *
 *   user text → code parses dates/numbers → provider picks among closed options
 *   → code validates every answer → your resolver/authorize/executor run in code.
 *
 * Models interpret. Code executes.
 */
import {
  parseDates,
  parseNumbers,
  phraseCandidates,
  type DateCandidate,
  type NumberCandidate,
  type Span,
} from "./parse.ts";
import { ProviderError, type ChoiceSpec, type FilterProvider, type ProviderResponse } from "./provider.ts";
import {
  fieldLabel,
  LIMITS,
  type DateRange,
  type EntityCandidate,
  type EntityField,
  type Field,
  type Fields,
  type Filters,
  type NumberRange,
  type SearchSchema,
} from "./schema.ts";
import { isSatisfiable, validateFilters } from "./validate.ts";

// ---------- public types ----------

export interface FilterChip {
  field: string;
  /** Human-readable, e.g. "Priority is high" or "Created from 2026-09-14 to before 2026-09-21". */
  text: string;
  /** The part of the request this came from, when there is one. */
  source?: string;
}

export interface ClarificationOption<F extends Fields = Fields> {
  /** Enum value, entity id, or field name, depending on `kind`. */
  value: string;
  label: string;
  /** Merge this into `filters` when the user picks the option, then call `execute`. */
  filters: Filters<F>;
}

export interface Clarification<F extends Fields = Fields> {
  kind: "choose_value" | "choose_entity" | "choose_field" | "no_match" | "ambiguous_date";
  field?: string;
  /** Suggested question to show, e.g. "Which customer did you mean?". */
  question: string;
  /** The part of the request that needs clarifying. */
  phrase?: string;
  /** Empty for `no_match` and `ambiguous_date`: ask the user to rephrase or use manual filters. */
  options: ClarificationOption<F>[];
}

export type UnsupportedReason =
  | "no_filters"
  | "out_of_scope"
  | "multiple_values"
  | "contradictory"
  | "unit_mismatch"
  | "too_complex";

export interface ResultMeta {
  schemaVersion: string;
  provider: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens?: number };
}

export type NaturalFilterResult<F extends Fields = Fields> =
  | { status: "ready"; filters: Filters<F>; interpretation: FilterChip[]; meta: ResultMeta }
  | {
      status: "needs_clarification";
      /** What was understood so far. Not executable until the questions are answered. */
      filters: Filters<F>;
      interpretation: FilterChip[];
      questions: Clarification<F>[];
      meta: ResultMeta;
    }
  | { status: "unsupported"; reason: UnsupportedReason; message: string; field?: string; meta?: ResultMeta }
  | { status: "blocked"; reason: "unauthorized" | "empty_input" | "input_too_long"; message: string }
  | {
      status: "unavailable";
      reason: "provider_error" | "timeout" | "invalid_provider_output" | "resolver_error";
      retryable: boolean;
      message: string;
    };

export type ExecuteResult<F extends Fields, R> =
  | { status: "ok"; filters: Filters<F>; results: R }
  | { status: "invalid"; errors: string[] }
  | { status: "blocked"; reason: "unauthorized"; message: string };

export interface NaturalFilterConfig<F extends Fields, Ctx, R> {
  schema: SearchSchema<F>;
  provider: FilterProvider<Ctx>;
  /**
   * Your read-only search. It receives validated filters and the trusted context. Apply the
   * tenant/user scope from `context` as an outer AND; never take scope from `filters`.
   */
  executor?: (filters: Filters<F>, context: Ctx) => Promise<R> | R;
  /** Deny-by-default gate, run before any model call and again before every execute. */
  authorize?: (context: Ctx) => Promise<boolean> | boolean;
  /** IANA timezone for date phrases. Default "UTC". Can be overridden per call. */
  timeZone?: string;
  /** 0 = Sunday, 1 = Monday. Default 1. */
  weekStartsOn?: number;
  /** Minimum probability to accept a non-default answer without asking. Default 0.6. */
  minConfidence?: number;
  /** Total budget for one `prepare`, including the model call and resolver. Default 10 000 ms. */
  timeoutMs?: number;
  /** Max request length in characters. Default 500 (and 2 KiB of UTF-8). */
  maxInputLength?: number;
  /** Allow `execute({})` (browse everything within scope). Default false. */
  allowEmptyFilters?: boolean;
  /** Called with provider/resolver errors so you can log them. Results never include error details. */
  onError?: (error: unknown, stage: "provider" | "resolver" | "authorize") => void;
}

export interface PrepareOptions<Ctx> {
  context?: Ctx;
  /** Reference time for relative dates. Default: now. */
  now?: Date;
  timeZone?: string;
  signal?: AbortSignal;
}

export interface NaturalFilter<F extends Fields, Ctx, R> {
  readonly schema: SearchSchema<F>;
  /** Interpret text into filters. Never calls the executor. */
  prepare(text: string, options?: PrepareOptions<Ctx>): Promise<NaturalFilterResult<F>>;
  /** Validate filters (from `prepare`, a clarification, or manual edits), re-authorize, then run the executor. */
  execute(filters: unknown, options?: { context?: Ctx }): Promise<ExecuteResult<F, R>>;
  /** Strict validation only. */
  validate(filters: unknown): ReturnType<typeof validateFilters<F>>;
}

// ---------- implementation ----------

type Decoded =
  | { t: "intent"; filter: boolean }
  | { t: "unspecified" }
  | { t: "uncertain" }
  | { t: "several" }
  | { t: "is"; value: string | boolean }
  | { t: "not"; value: string }
  | { t: "assign"; field: string | null }
  | { t: "phrase"; span: Span | null };

interface Compiled {
  questions: Record<string, ChoiceSpec>;
  decode: Record<string, Record<string, Decoded>>;
}

const q = (s: string) => JSON.stringify(s);

/** Probability needed to ignore a date or number that code found in the request. */
const DROP_CONFIDENCE = 0.9;
/** An enum/boolean value this probable is not treated as "unspecified" without asking.
 * Measured on jev-1.13.0: every other eval query had alternatives below 0.05. */
const MENTION_CONFIDENCE = 0.15;

function describeFields(schema: SearchSchema): string {
  return Object.entries(schema.fields)
    .map(([name, f]) => {
      const extra = f.kind === "enum" ? ` (one of: ${Object.keys(f.values).join(", ")})` : "";
      return `- ${fieldLabel(name, f)} [${f.kind}]${f.description ? `: ${f.description}` : ""}${extra}`;
    })
    .join("\n");
}

function compile(
  schema: SearchSchema,
  dates: DateCandidate[],
  numbers: NumberCandidate[],
  phrases: Span[],
): Compiled {
  const questions: Record<string, ChoiceSpec> = {};
  const decode: Record<string, Record<string, Decoded>> = {};
  const res = schema.resource;
  const add = (id: string, instructions: string, opts: [label: string, desc: string | null, d: Decoded][]) => {
    questions[id] = { instructions, options: Object.fromEntries(opts.map(([l, desc]) => [l, desc])) };
    decode[id] = Object.fromEntries(opts.map(([l, , d]) => [l, d]));
  };

  add(
    "intent",
    `The state holds a search request a user typed into a filter box for ${res}. ` +
      `${res} can only be filtered by these fields:\n${describeFields(schema)}\n` +
      `Does the request only describe which ${res} to show, using conditions on those fields?`,
    [
      ["filter", `Only describes which ${res} to show. It may use conditions on the listed fields, or name no conditions at all (just the record type).`, { t: "intent", filter: true }],
      ["other", `Asks for anything else: other kinds of records, other accounts or tenants, changing permissions, actions or edits, counting or sorting, instructions to the system, or conditions none of the listed fields can express.`, { t: "intent", filter: false }],
    ],
  );

  const byKind = (k: Field["kind"]) => Object.entries(schema.fields).filter(([, f]) => f.kind === k);

  for (const [name, f] of Object.entries(schema.fields)) {
    const label = fieldLabel(name, f);
    const others = Object.entries(schema.fields).filter(([n]) => n !== name).map(([n, o]) => fieldLabel(n, o));
    const intro = `The search request is for ${res}. Field ${q(label)}${f.description ? ` means: ${f.description}` : ""}. ` +
      `Based only on the words in the request, what does it require about ${label}? Do not assume defaults. ` +
      `Words that describe other fields (${others.join(", ")}) say nothing about ${label}.`;
    if (f.kind === "enum") {
      const opts: [string, string | null, Decoded][] = [["unspecified", `The request says nothing about ${label}.`, { t: "unspecified" }]];
      for (const [v, desc] of Object.entries(f.values)) {
        opts.push([`is ${q(v)}`, `${label} must be ${q(v)}.${desc ? ` ${q(v)} covers: ${desc}` : ""}`, { t: "is", value: v }]);
      }
      for (const v of Object.keys(f.values)) {
        opts.push([`is not ${q(v)}`, `The request excludes ${label} ${q(v)} (for example "not ${v}", "except ${v}").`, { t: "not", value: v }]);
      }
      opts.push(["several values", `The request allows or excludes more than one ${label} value (for example "A or B").`, { t: "several" }]);
      opts.push(["unclear", `The request seems to constrain ${label}, but it is unclear which value is meant.`, { t: "uncertain" }]);
      add(`field_${name}`, intro, opts);
    } else if (f.kind === "boolean") {
      add(`field_${name}`, intro, [
        ["unspecified", `The request says nothing about ${label}.`, { t: "unspecified" }],
        ["yes", `Only ${res} where ${label} is true.`, { t: "is", value: true }],
        ["no", `Only ${res} where ${label} is false.`, { t: "is", value: false }],
        ["unclear", `The request seems to mention ${label} but it is unclear whether it must be true or false.`, { t: "uncertain" }],
      ]);
    }
  }

  const assign = (id: string, kind: "date" | "number", span: Span) => {
    const fields = byKind(kind);
    add(
      id,
      `The search request for ${res} contains the ${kind === "date" ? "time" : "number"} phrase ${q(span.text)}. ` +
        `Which field does it restrict? Pick the closest matching field even if the request does not name it. ` +
        `Choose "none" only if the phrase is clearly not a condition on ${res}.`,
      [
        ...fields.map(([n, f]): [string, string | null, Decoded] => [n, `${fieldLabel(n, f)}${f.description ? `: ${f.description}` : ""}`, { t: "assign", field: n }]),
        ["none", `The phrase does not filter any of these fields.`, { t: "assign", field: null }],
      ],
    );
  };
  if (byKind("date").length) dates.forEach((d, i) => assign(`date_${i}`, "date", d));
  if (byKind("number").length) numbers.forEach((n, i) => assign(`number_${i}`, "number", n));

  for (const [name, f] of byKind("entity")) {
    if (!phrases.length) continue;
    const label = fieldLabel(name, f);
    add(
      `entity_${name}`,
      `The search request is for ${res}. Which phrase in the request names the ${label}${f.description ? ` (${f.description})` : ""} to filter by?`,
      [
        ["none", `The request does not name a specific ${label}.`, { t: "phrase", span: null }],
        ...phrases.map((p, i): [string, string | null, Decoded] => [`phrase ${i + 1}`, q(p.text), { t: "phrase", span: p }]),
      ],
    );
  }
  return { questions, decode };
}

function dateText(r: DateRange): string {
  if (r.gte && r.lt) return `from ${r.gte} to before ${r.lt}`;
  if (r.gte) return `on or after ${r.gte}`;
  return `before ${r.lt}`;
}

const OP_TEXT: Record<keyof NumberRange, string> = { eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤" };
function numberText(r: NumberRange, unit?: string): string {
  return (Object.keys(r) as (keyof NumberRange)[])
    .map((op) => `${OP_TEXT[op]} ${r[op]}${unit ? ` ${unit}` : ""}`)
    .join(" and ");
}

function mergeNumber(a: NumberRange, b: NumberRange): NumberRange {
  const out: NumberRange = { ...a };
  for (const [op, v] of Object.entries(b) as [keyof NumberRange, number][]) {
    const cur = out[op];
    if (cur === undefined) out[op] = v;
    else if (op === "lt" || op === "lte") out[op] = Math.min(cur, v);
    else if (op === "gt" || op === "gte") out[op] = Math.max(cur, v);
    else if (cur !== v) return { gt: 1, lt: 0 }; // two different "eq": never satisfiable
  }
  return out;
}

function mergeDate(a: DateRange, b: DateRange): DateRange {
  const gte = [a.gte, b.gte].filter(Boolean).sort().pop();
  const lt = [a.lt, b.lt].filter(Boolean).sort()[0];
  return { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
}

function withDeadline<T>(p: Promise<T> | T, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(p)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "APITimeoutError");
}

function cleanCandidates(list: unknown): EntityCandidate[] | null {
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const out: EntityCandidate[] = [];
  for (const c of list) {
    if (!c || typeof c.id !== "string" || typeof c.label !== "string" || !c.id) return null;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, label: c.label.slice(0, 200) });
    if (out.length >= LIMITS.maxEntityCandidates) break;
  }
  return out;
}

export function createNaturalFilter<F extends Fields, Ctx = unknown, R = unknown>(
  config: NaturalFilterConfig<F, Ctx, R>,
): NaturalFilter<F, Ctx, R> {
  const { schema, provider } = config;
  if (!schema?.fields) throw new TypeError("createNaturalFilter needs a schema from defineSearch()");
  if (!provider || typeof provider.choose !== "function") throw new TypeError("createNaturalFilter needs a provider");
  const minConfidence = config.minConfidence ?? 0.6;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const maxLen = config.maxInputLength ?? 500;

  async function authorized(context: Ctx): Promise<boolean> {
    if (!config.authorize) return true;
    try {
      return (await config.authorize(context)) === true;
    } catch (e) {
      config.onError?.(e, "authorize");
      return false;
    }
  }

  async function prepare(text: string, options: PrepareOptions<Ctx> = {}): Promise<NaturalFilterResult<F>> {
    // A ref'd timer, not AbortSignal.timeout(): that one is unref'd, so a hung provider could let
    // the process exit before the deadline fires (seen on Node 22). Cleared on every return path.
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new DOMException("prepare() exceeded its time budget", "TimeoutError")),
      timeoutMs,
    );
    const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    try {
      return await interpret(text, options, signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async function interpret(text: string, options: PrepareOptions<Ctx>, signal: AbortSignal): Promise<NaturalFilterResult<F>> {
    const context = options.context as Ctx;
    const input = typeof text === "string" ? text.normalize("NFC").replace(/\s+/g, " ").trim() : "";
    if (!input) return { status: "blocked", reason: "empty_input", message: "Type what you are looking for." };
    if (input.length > maxLen || new TextEncoder().encode(input).length > 2048) {
      return { status: "blocked", reason: "input_too_long", message: `Keep searches under ${maxLen} characters.` };
    }
    if (!(await authorized(context))) {
      return { status: "blocked", reason: "unauthorized", message: "You can't search here." };
    }

    const dates = parseDates(input, {
      now: options.now ?? new Date(),
      timeZone: options.timeZone ?? config.timeZone ?? "UTC",
      weekStartsOn: config.weekStartsOn ?? 1,
    });
    const numbers = parseNumbers(input, dates);
    if (dates.length > 4 || numbers.length > 4) {
      return { status: "unsupported", reason: "too_complex", message: "That request has too many dates or numbers. Try fewer conditions." };
    }
    const entityEntry = Object.entries(schema.fields).find(([, f]) => f.kind === "entity");
    // The resource's own name ("support tickets", "ticket") is never an entity name.
    const resourceWords = schema.resource.split(/\s+/).flatMap((w) => [w, w.replace(/s$/i, "")]);
    const phrases = entityEntry ? phraseCandidates(input, [...dates, ...numbers], resourceWords) : [];
    const compiled = compile(schema, dates, numbers, phrases);


    let response: ProviderResponse;
    try {
      response = await withDeadline(
        provider.choose({ state: { search_request: input }, questions: compiled.questions }, { context, signal }),
        signal,
      );
    } catch (e) {
      config.onError?.(e, "provider");
      if (isTimeout(e) || (signal.aborted && isTimeout(signal.reason))) {
        return { status: "unavailable", reason: "timeout", retryable: true, message: "Search interpretation timed out." };
      }
      const retryable = e instanceof ProviderError ? e.retryable : true;
      return { status: "unavailable", reason: "provider_error", retryable, message: "Search interpretation is unavailable." };
    }

    // Every answer must be one of the options we asked. Anything else is a provider fault.
    const picks: Record<string, { d: Decoded; p: number; probs: Record<string, number> }> = {};
    for (const [id, spec] of Object.entries(compiled.questions)) {
      const a = response?.answers?.[id];
      const choice = a?.choice;
      if (typeof choice !== "string" || !Object.prototype.hasOwnProperty.call(spec.options, choice)) {
        config.onError?.(new Error(`invalid answer for ${id}`), "provider");
        return { status: "unavailable", reason: "invalid_provider_output", retryable: false, message: "Search interpretation returned an invalid answer." };
      }
      const raw = a?.probabilities?.[choice];
      const p = typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : 1;
      const probs: Record<string, number> = {};
      for (const [label, v] of Object.entries(a?.probabilities ?? {})) {
        if (Object.prototype.hasOwnProperty.call(spec.options, label) && typeof v === "number" && v >= 0 && v <= 1) probs[label] = v;
      }
      picks[id] = { d: compiled.decode[id]![choice]!, p, probs };
    }
    const meta: ResultMeta = {
      schemaVersion: schema.version,
      provider: provider.name,
      ...(response.model ? { model: response.model } : {}),
      ...(response.usage ? { usage: response.usage } : {}),
    };

    const intent = picks.intent!.d;
    if (intent.t === "intent" && !intent.filter) {
      return { status: "unsupported", reason: "out_of_scope", message: `This search can only filter ${schema.resource} by its listed fields.`, meta };
    }

    const filters: Record<string, unknown> = {};
    const chips: FilterChip[] = [];
    const questions: Clarification<F>[] = [];
    const opt = (value: string, label: string, patch: Record<string, unknown>): ClarificationOption<F> =>
      ({ value, label, filters: patch as Filters<F> });

    // Enum and boolean fields.
    for (const [name, f] of Object.entries(schema.fields)) {
      const pick = picks[`field_${name}`];
      if (!pick) continue;
      const label = fieldLabel(name, f);
      const { d, p } = pick;
      const values = f.kind === "enum" ? Object.keys(f.values) : ["true", "false"];
      const chooseValue = (): Clarification<F> => ({
        kind: "choose_value",
        field: name,
        question: `Which ${label} did you mean?`,
        options: [
          ...values.map((v) => opt(v, v, { [name]: f.kind === "boolean" ? v === "true" : v })),
          opt("any", `Any ${label}`, {}),
        ],
      });
      if (d.t === "unspecified") {
        // A value the model found plausible is never dropped silently: ask instead.
        const decode = compiled.decode[`field_${name}`]!;
        const best = Math.max(0, ...Object.entries(pick.probs).filter(([l]) => decode[l]?.t === "is" || decode[l]?.t === "not").map(([, v]) => v));
        if (best >= MENTION_CONFIDENCE) questions.push(chooseValue());
        continue;
      }
      if (d.t === "several") {
        return { status: "unsupported", reason: "multiple_values", field: name, message: `Pick one ${label} at a time for now.`, meta };
      }
      if (d.t === "uncertain" || p < minConfidence) {
        questions.push(chooseValue());
        continue;
      }
      if (d.t === "is") {
        filters[name] = d.value;
        chips.push({ field: name, text: f.kind === "boolean" ? `${label}: ${d.value ? "yes" : "no"}` : `${label} is ${d.value}` });
      } else if (d.t === "not") {
        filters[name] = { not: d.value };
        chips.push({ field: name, text: `${label} is not ${d.value}` });
      }
    }

    // Dates and numbers: code parsed the values; the provider only assigned them to fields.
    const assigned = <C extends Span & { range?: DateRange | NumberRange }>(kind: "date" | "number", cands: C[]) => {
      const out: { c: C; field: string }[] = [];
      cands.forEach((c, i) => {
        const pick = picks[`${kind}_${i}`];
        if (!pick || pick.d.t !== "assign") return;
        const value = c.range;
        // Code already parsed this value: dropping it ("none") needs high confidence, or we ask.
        const unsure = pick.d.field === null ? pick.p < DROP_CONFIDENCE : pick.p < minConfidence;
        if (unsure && !value) {
          // An ambiguous date (03/04/2026) the model isn't sure about: still ask, never drop.
          questions.push({ kind: "ambiguous_date", phrase: c.text, question: `${q(c.text)} could mean two dates. Write it as YYYY-MM-DD.`, options: [] });
          return;
        }
        if (unsure) {
          questions.push({
            kind: "choose_field",
            phrase: c.text,
            question: `Which field should ${q(c.text)} apply to?`,
            options: [
              ...Object.entries(schema.fields)
                .filter(([, f]) => f.kind === kind)
                .map(([n, f]) => opt(n, fieldLabel(n, f), { [n]: value })),
              opt("none", "Don't filter by this", {}),
            ],
          });
          return;
        }
        if (pick.d.field === null) return;
        out.push({ c, field: pick.d.field });
      });
      return out;
    };

    const dateByField: Record<string, { range: DateRange; source: string[] }> = {};
    for (const { c, field } of assigned("date", dates)) {
      if (!c.range) {
        questions.push({ kind: "ambiguous_date", field, phrase: c.text, question: `${q(c.text)} could mean two dates. Write it as YYYY-MM-DD.`, options: [] });
        continue;
      }
      const prev = dateByField[field];
      dateByField[field] = prev
        ? { range: mergeDate(prev.range, c.range), source: [...prev.source, c.text] }
        : { range: c.range, source: [c.text] };
    }
    for (const [name, { range, source }] of Object.entries(dateByField)) {
      if (range.gte && range.lt && range.gte >= range.lt) {
        return { status: "unsupported", reason: "contradictory", field: name, message: `Those dates for ${fieldLabel(name, schema.fields[name]!)} can't all be true.`, meta };
      }
      filters[name] = range;
      chips.push({ field: name, text: `${fieldLabel(name, schema.fields[name]!)} ${dateText(range)}`, source: source.join(", ") });
    }

    const numByField: Record<string, { range: NumberRange; source: string[] }> = {};
    for (const { c, field } of assigned("number", numbers)) {
      const f = schema.fields[field]!;
      if (f.kind === "number" && f.unit && c.unit && f.unit.toUpperCase() !== c.unit) {
        return { status: "unsupported", reason: "unit_mismatch", field, message: `${fieldLabel(field, f)} is in ${f.unit}, not ${c.unit}.`, meta };
      }
      const prev = numByField[field];
      numByField[field] = prev
        ? { range: mergeNumber(prev.range, c.range), source: [...prev.source, c.text] }
        : { range: c.range, source: [c.text] };
    }
    for (const [name, { range, source }] of Object.entries(numByField)) {
      const f = schema.fields[name]!;
      if (!isSatisfiable(range)) {
        return { status: "unsupported", reason: "contradictory", field: name, message: `Those limits for ${fieldLabel(name, f)} can't all be true.`, meta };
      }
      filters[name] = range;
      chips.push({ field: name, text: `${fieldLabel(name, f)} ${numberText(range, f.kind === "number" ? f.unit : undefined)}`, source: source.join(", ") });
    }

    // Entities: the provider picked a phrase from the request; your resolver finds records.
    if (entityEntry) {
      const [name, f] = entityEntry as [string, EntityField<Ctx>];
      const pick = picks[`entity_${name}`];
      if (pick && pick.d.t === "phrase" && pick.d.span) {
        const phrase = pick.d.span.text;
        const label = fieldLabel(name, f);
        let found: EntityCandidate[] | null;
        try {
          found = cleanCandidates(await withDeadline(f.resolve(phrase, context), signal));
        } catch (e) {
          config.onError?.(e, "resolver");
          return { status: "unavailable", reason: isTimeout(e) ? "timeout" : "resolver_error", retryable: true, message: `Couldn't look up ${label}.` };
        }
        if (found === null) {
          config.onError?.(new Error("resolver returned an invalid shape"), "resolver");
          return { status: "unavailable", reason: "resolver_error", retryable: false, message: `Couldn't look up ${label}.` };
        }
        if (found.length === 1) {
          filters[name] = found[0]!.id;
          chips.push({ field: name, text: `${label} is ${found[0]!.label}`, source: phrase });
        } else if (found.length === 0) {
          questions.push({ kind: "no_match", field: name, phrase, question: `No ${label} matched ${q(phrase)}.`, options: [] });
        } else {
          questions.push({
            kind: "choose_entity",
            field: name,
            phrase,
            question: `Which ${label} did you mean?`,
            options: found.map((c) => opt(c.id, c.label, { [name]: c.id })),
          });
        }
      }
    }

    if (questions.length) {
      return { status: "needs_clarification", filters: filters as Filters<F>, interpretation: chips, questions, meta };
    }
    if (Object.keys(filters).length === 0) {
      return { status: "unsupported", reason: "no_filters", message: `Add a condition, for example a ${Object.keys(schema.fields).slice(0, 2).join(" or ")}.`, meta };
    }
    // Defense in depth: what we built must pass the same validator as client input.
    const check = validateFilters(schema, filters);
    if (!check.ok) {
      return { status: "unsupported", reason: "contradictory", message: "That combination of conditions can't be searched.", meta };
    }
    return { status: "ready", filters: check.filters, interpretation: chips, meta };
  }

  async function execute(filters: unknown, options: { context?: Ctx } = {}): Promise<ExecuteResult<F, R>> {
    if (!config.executor) throw new Error("createNaturalFilter: no executor configured");
    const context = options.context as Ctx;
    const check = validateFilters(schema, filters);
    if (!check.ok) return { status: "invalid", errors: check.errors };
    if (!config.allowEmptyFilters && Object.keys(check.filters).length === 0) {
      return { status: "invalid", errors: ["no filters"] };
    }
    if (!(await authorized(context))) return { status: "blocked", reason: "unauthorized", message: "You can't search here." };
    for (const [name, f] of Object.entries(schema.fields)) {
      const id = (check.filters as Record<string, unknown>)[name];
      if (f.kind === "entity" && typeof id === "string" && f.verify) {
        let ok = false;
        try {
          ok = (await f.verify(id, context)) === true;
        } catch (e) {
          config.onError?.(e, "resolver");
        }
        if (!ok) return { status: "invalid", errors: [`${name}: not found`] };
      }
    }
    const results = await config.executor(check.filters, context);
    return { status: "ok", filters: check.filters, results };
  }

  return {
    schema,
    prepare,
    execute,
    validate: (filters: unknown) => validateFilters(schema, filters),
  };
}
