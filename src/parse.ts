/**
 * Deterministic parsing of dates and numbers. The model never produces a value: it only
 * decides which field a span found here belongs to. Code owns the bytes and the calendar math.
 */
import type { DateRange, NumberRange } from "./schema.ts";

export interface Span {
  start: number;
  end: number;
  /** The exact source text, including comparator words ("under $500", "before yesterday"). */
  text: string;
}

export interface DateCandidate extends Span {
  /** Undefined when the phrase is ambiguous (e.g. 03/04/2026). */
  range?: DateRange;
}

export interface NumberCandidate extends Span {
  range: NumberRange;
  /** Upper-case currency or unit code when the text named one. */
  unit?: string;
}

// ---------- calendar helpers (plain dates, no timezone math after "today") ----------

const DAY_MS = 86_400_000;

/** Today's calendar date in `timeZone`, as YYYY-MM-DD. */
export function todayIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

const toYmd = (iso: string): Ymd => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};
const fmt = ({ y, m, d }: Ymd): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fromUtc = (ms: number): Ymd => {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const utc = ({ y, m, d }: Ymd): number => Date.UTC(y, m - 1, d);
const addDays = (v: Ymd, n: number): Ymd => fromUtc(utc(v) + n * DAY_MS);
const addMonths = (v: Ymd, n: number): Ymd => fromUtc(Date.UTC(v.y, v.m - 1 + n, 1));
const isValid = (v: Ymd): boolean => {
  const back = fromUtc(utc(v));
  return back.y === v.y && back.m === v.m && back.d === v.d;
};

type Range = [Ymd, Ymd]; // half-open [start, end)

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const monthNum = (name: string): number => MONTHS[name.slice(0, 3)]!;
const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const ORD = "(?:st|nd|rd|th)?";

/** Base date expressions. Order matters: longer forms first. */
const BASE = [
  "today",
  "yesterday",
  "(?:this|last|previous|past)\\s+(?:week|month|quarter|year)",
  "(?:last|past)\\s+\\d{1,3}\\s+(?:days?|weeks?|months?)",
  "\\d{4}-\\d{2}-\\d{2}",
  "\\d{1,2}/\\d{1,2}/\\d{4}",
  `(?:${MONTH_RE})\\.?\\s+\\d{1,2}${ORD}(?:,?\\s+\\d{4})?`,
  `\\d{1,2}${ORD}\\s+(?:of\\s+)?(?:${MONTH_RE})\\.?(?:,?\\s+\\d{4})?`,
  `(?:${MONTH_RE})\\.?,?\\s+\\d{4}`,
  // A bare month name only after "in"/"during"/"since"/etc. is handled by the outer pattern.
].join("|");

const BARE_MONTH = `(?:${MONTH_RE.replace("|may|", "|")})`; // "may" alone is too often a verb

const DATE_RE = new RegExp(
  "\\b(?:" +
    `(from|between)\\s+(${BASE})\\s+(?:to|until|till|through|and)\\s+(${BASE})` +
    `|(since|after|before|on|from|in|during|until|till)\\s+(${BASE}|${BARE_MONTH}|may)` +
    `|(${BASE})` +
    ")\\b",
  "gi",
);

/** Resolve one base expression to a half-open range, or "ambiguous", or null if invalid. */
function resolveBase(raw: string, today: Ymd, weekStartsOn: number): Range | "ambiguous" | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const tomorrow = addDays(today, 1);
  if (s === "today") return [today, tomorrow];
  if (s === "yesterday") return [addDays(today, -1), today];

  let m = /^(this|last|previous|past) (week|month|quarter|year)$/.exec(s);
  if (m) {
    const [, which, unit] = m;
    if (which === "past") {
      // Rolling window ending today (inclusive).
      if (unit === "week") return [addDays(today, -6), tomorrow];
      if (unit === "month") return [clampDay(addMonths(today, -1), today.d), tomorrow];
      if (unit === "quarter") return [clampDay(addMonths(today, -3), today.d), tomorrow];
      return [clampDay(addMonths(today, -12), today.d), tomorrow];
    }
    const back = which === "this" ? 0 : -1;
    if (unit === "week") {
      const dow = new Date(utc(today)).getUTCDay();
      const start = addDays(today, -((dow - weekStartsOn + 7) % 7) + back * 7);
      return [start, addDays(start, 7)];
    }
    if (unit === "month") {
      const start = addMonths({ ...today, d: 1 }, back);
      return [start, addMonths(start, 1)];
    }
    if (unit === "quarter") {
      const q = Math.floor((today.m - 1) / 3);
      const start = addMonths({ y: today.y, m: q * 3 + 1, d: 1 }, back * 3);
      return [start, addMonths(start, 3)];
    }
    const y = today.y + back;
    return [{ y, m: 1, d: 1 }, { y: y + 1, m: 1, d: 1 }];
  }

  m = /^(?:last|past) (\d{1,3}) (day|week|month)s?$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) return null;
    // "last 7 days" = exactly 7 calendar days, today included.
    if (m[2] === "day") return [addDays(today, -(n - 1)), tomorrow];
    if (m[2] === "week") return [addDays(today, -(7 * n - 1)), tomorrow];
    return [clampDay(addMonths(today, -n), today.d), tomorrow];
  }

  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return day({ y: +m[1]!, m: +m[2]!, d: +m[3]! });

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!;
    if (a > 12 && b <= 12) return day({ y, m: b, d: a }); // DD/MM
    if (b > 12 && a <= 12) return day({ y, m: a, d: b }); // MM/DD
    if (a === b) return day({ y, m: a, d: a });
    return "ambiguous";
  }

  m = new RegExp(`^(${MONTH_RE})\\.? (\\d{1,2})${ORD}(?:,? (\\d{4}))?$`).exec(s);
  if (m) return dayInYear(monthNum(m[1]!), +m[2]!, m[3], today);

  m = new RegExp(`^(\\d{1,2})${ORD} (?:of )?(${MONTH_RE})\\.?(?:,? (\\d{4}))?$`).exec(s);
  if (m) return dayInYear(monthNum(m[2]!), +m[1]!, m[3], today);

  m = new RegExp(`^(${MONTH_RE})\\.?(?:,? (\\d{4}))?$`).exec(s);
  if (m) {
    const month = monthNum(m[1]!);
    // Without a year, use the most recent month that has started.
    const y = m[2] ? +m[2] : month <= today.m ? today.y : today.y - 1;
    const start = { y, m: month, d: 1 };
    return [start, addMonths(start, 1)];
  }
  return null;
}

function daysIn(v: Ymd): number {
  return fromUtc(Date.UTC(v.y, v.m, 0)).d;
}
function clampDay(v: Ymd, d: number): Ymd {
  return { y: v.y, m: v.m, d: Math.min(d, daysIn(v)) };
}
function day(v: Ymd): Range | null {
  return isValid(v) ? [v, addDays(v, 1)] : null;
}
function dayInYear(month: number, d: number, year: string | undefined, today: Ymd): Range | null {
  if (year) return day({ y: +year, m: month, d });
  // Without a year, use the most recent occurrence that is not in the future.
  const thisYear = { y: today.y, m: month, d };
  return utc(thisYear) <= utc(today) ? day(thisYear) : day({ y: today.y - 1, m: month, d });
}

export interface DateParseOptions {
  now: Date;
  timeZone: string;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: number;
}

/** Find date phrases and resolve each to a half-open calendar range. */
export function parseDates(text: string, opts: DateParseOptions): DateCandidate[] {
  const today = toYmd(todayIn(opts.now, opts.timeZone));
  const wso = opts.weekStartsOn ?? 1;
  const out: DateCandidate[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const span = { start: m.index!, end: m.index! + m[0].length, text: m[0] };
    let range: DateRange | undefined;
    let ambiguous = false;
    if (m[1]) {
      const a = resolveBase(m[2]!, today, wso);
      const b = resolveBase(m[3]!, today, wso);
      if (a === null || b === null) continue;
      if (a === "ambiguous" || b === "ambiguous") ambiguous = true;
      else range = { gte: fmt(a[0]), lt: fmt(b[1]) };
    } else if (m[4]) {
      const r = resolveBase(m[5]!, today, wso);
      if (r === null) continue;
      if (r === "ambiguous") ambiguous = true;
      else {
        const prep = m[4].toLowerCase();
        if (prep === "since") range = { gte: fmt(r[0]) };
        else if (prep === "after") range = { gte: fmt(r[1]) };
        else if (prep === "before") range = { lt: fmt(r[0]) };
        else if (prep === "until" || prep === "till") range = { lt: fmt(r[1]) };
        else range = { gte: fmt(r[0]), lt: fmt(r[1]) };
      }
    } else {
      const r = resolveBase(m[6]!, today, wso);
      if (r === null) continue;
      if (r === "ambiguous") ambiguous = true;
      else range = { gte: fmt(r[0]), lt: fmt(r[1]) };
    }
    if (range && range.gte && range.lt && range.gte >= range.lt) continue; // backwards "from X to Y"
    out.push(ambiguous ? span : { ...span, range });
  }
  return out;
}

// ---------- numbers ----------

const CURRENCY_SYMBOL: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" };
const CURRENCY_WORD: Record<string, string> = {
  usd: "USD", dollar: "USD", dollars: "USD", inr: "INR", rs: "INR", "rs.": "INR", rupee: "INR",
  rupees: "INR", eur: "EUR", euro: "EUR", euros: "EUR", gbp: "GBP", pound: "GBP", pounds: "GBP",
};

const NUMBER_RE =
  /(?:([$€£₹])\s?|\b(usd|inr|eur|gbp|rs\.?)\s?)?(?<![\w.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(k|m|lakhs?|crores?)\b)?(?![\w,.]*\d)(?:\s?(usd|inr|eur|gbp|dollars?|rupees?|euros?|pounds?)\b)?/gi;

const BEFORE: [RegExp, keyof NumberRange][] = [
  [/(?:under|below|less than|fewer than|lower than|cheaper than|smaller than|<)\s*$/, "lt"],
  [/(?:at most|no more than|not more than|up to|maximum(?: of)?|max|<=)\s*$/, "lte"],
  [/(?:over|above|more than|greater than|higher than|larger than|exceeding|>)\s*$/, "gt"],
  [/(?:at least|no less than|not less than|minimum(?: of)?|min|>=)\s*$/, "gte"],
  [/(?:exactly|equal to|equals|=)\s*$/, "eq"],
];
const AFTER: [RegExp, keyof NumberRange][] = [
  [/^\s*(?:\+|or more|or above|or higher|and above|and up|or greater)/, "gte"],
  [/^\s*(?:or less|or fewer|or below|or lower|and below|and under)/, "lte"],
];
const MULT: Record<string, number> = { k: 1e3, m: 1e6, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 };

/** Find numbers (with currency and comparator words) outside the given excluded spans. */
export function parseNumbers(text: string, exclude: Span[] = []): NumberCandidate[] {
  const lower = text.toLowerCase();
  const raw: { start: number; end: number; value: number; unit?: string }[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index!;
    const end = start + m[0].replace(/\s+$/, "").length;
    if (exclude.some((e) => start < e.end && end > e.start)) continue;
    let value = Number(m[3]!.replace(/,/g, ""));
    const mult = m[4]?.toLowerCase();
    if (mult) value *= MULT[mult]!;
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) continue;
    const cur = m[1] ? CURRENCY_SYMBOL[m[1]] : m[2] ? CURRENCY_WORD[m[2].toLowerCase()] : m[5] ? CURRENCY_WORD[m[5].toLowerCase()] : undefined;
    raw.push({ start, end, value, ...(cur ? { unit: cur } : {}) });
  }

  const out: NumberCandidate[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = raw[i]!;
    const next = raw[i + 1];
    const before = lower.slice(Math.max(0, n.start - 24), n.start);
    const between = /between\s*$/.exec(before);
    if (between && next && /^\s*(?:and|to|-)\s*$/.test(lower.slice(n.end, next.start))) {
      const start = n.start - (before.length - between.index);
      const lo = Math.min(n.value, next.value), hi = Math.max(n.value, next.value);
      const unit = n.unit ?? next.unit;
      out.push({ start, end: next.end, text: text.slice(start, next.end), range: { gte: lo, lte: hi }, ...(unit ? { unit } : {}) });
      i++;
      continue;
    }
    let op: keyof NumberRange = "eq";
    let start = n.start;
    let end = n.end;
    const b = BEFORE.find(([re]) => re.test(before));
    if (b) {
      op = b[1];
      start = n.start - (before.length - before.search(b[0]));
    } else {
      const after = lower.slice(n.end, n.end + 16);
      const a = AFTER.find(([re]) => re.test(after));
      if (a) {
        op = a[1];
        end = n.end + a[0].exec(after)![0].length;
      }
    }
    out.push({ start, end, text: text.slice(start, end), range: { [op]: n.value }, ...(n.unit ? { unit: n.unit } : {}) });
  }
  return out;
}

// ---------- entity phrase candidates ----------

const STOP = new Set(
  ("a an the and or but not no of for to from in on at by with without about as is are was were be been " +
    "that this these those which who whom whose what where when show me my our all any some find get list " +
    "give only just please still other than more less under over before after since until " +
    "today yesterday week month year last this past recent new s t").split(" "),
);

/**
 * Candidate phrases (1-3 consecutive non-stopword tokens) that might name an entity.
 * The model picks one of these by index; it can't invent a name.
 */
export function phraseCandidates(text: string, exclude: Span[] = [], extraStopWords: string[] = [], max = 60): Span[] {
  const stop = new Set([...STOP, ...extraStopWords.map((w) => w.toLowerCase())]);
  const tokens: Span[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}.&-]*/gu)) {
    const t = m[0].replace(/[.&-]+$/, "");
    const start = m.index!;
    tokens.push({ start, end: start + t.length, text: t });
  }
  const runs: Span[][] = [];
  let run: Span[] = [];
  for (const tok of tokens) {
    const blocked = stop.has(tok.text.toLowerCase()) || exclude.some((e) => tok.start < e.end && tok.end > e.start);
    if (blocked) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(tok);
  }
  if (run.length) runs.push(run);

  const seen = new Set<string>();
  const out: Span[] = [];
  for (const n of [3, 2, 1]) {
    for (const r of runs) {
      for (let i = 0; i + n <= r.length; i++) {
        const start = r[i]!.start, end = r[i + n - 1]!.end;
        const phrase = text.slice(start, end);
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ start, end, text: phrase });
      }
    }
  }
  // Prefer shorter phrases when over budget: they're the likeliest names.
  return out.length > max ? out.slice(out.length - max) : out;
}
