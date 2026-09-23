/**
 * Synthetic helpdesk data for the demo: three fictional companies, deterministic per day.
 * Nothing here is real. Every company has its own "Sam"s so "Sam's tickets" is ambiguous
 * inside one company and never reaches another.
 */
import {
  booleanField,
  dateField,
  defineSearch,
  entityField,
  enumField,
  numberField,
  todayIn,
  type Filters,
} from "../../src/index.ts";

export interface Account {
  id: string;
  company: string;
  user: string;
}

/** The "sign-in" allowlist. The visitor picks one; scope is derived from it, never from text. */
export const ACCOUNTS: Account[] = [
  { id: "acme", company: "Acme Corp", user: "Priya (support lead)" },
  { id: "globex", company: "Globex", user: "Diego (billing ops)" },
  { id: "initech", company: "Initech", user: "Mei (on-call engineer)" },
];

const CUSTOMER_NAMES: Record<string, string[]> = {
  acme: ["Sam Wilson", "Sam Kumar", "Sam Thomas", "Ravi Shah", "Lena Park", "Omar Haddad", "Julia Novak", "Ken Ito", "Ana Souza", "Tom Berg", "Nadia Ali", "Chris Olsen"],
  globex: ["Sam Okafor", "Sam Lee", "Aisha Khan", "Marco Rossi", "Ines Duarte", "Felix Wagner", "Hana Sato", "Leo Martin", "Zoe Adams", "Ivan Petrov"],
  initech: ["Sam Patel", "Grace Kim", "Noah Fischer", "Emma Dubois", "Arjun Rao", "Lucia Romero", "Ben Carter", "Yuki Mori", "Sara Lind", "Theo Laurent", "Maya Cohen"],
};

export interface Ticket {
  id: string;
  company: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "medium" | "high";
  category: "billing" | "technical" | "sales" | "account";
  channel: "email" | "chat" | "phone";
  escalated: boolean;
  amount: number;
  createdAt: string;
  customerId: string;
  customer: string;
}

const SUBJECTS: Record<Ticket["category"], string[]> = {
  billing: ["Charged twice this month", "Refund not received", "Invoice shows wrong VAT", "Card declined on renewal", "Need a copy of last invoice", "Unexpected overage fee", "Credit note request"],
  technical: ["Login loop after SSO change", "API returns 502 intermittently", "Export to CSV times out", "Webhook retries flooding", "Mobile app crashes on launch", "2FA codes not arriving", "Dashboard charts blank"],
  sales: ["Quote for 50 extra seats", "Enterprise plan pricing", "Upgrade to annual billing", "Volume discount question", "Trial extension request", "Procurement form needed"],
  account: ["Transfer workspace ownership", "Delete old teammate", "Change company name", "Merge two accounts", "Update billing contact", "Reset admin permissions"],
};

/** Small seeded PRNG (mulberry32) so data is stable for a given day. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const weighted = <T,>(r: () => number, xs: [T, number][]): T => {
  let x = r() * xs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of xs) if ((x -= w) < 0) return v;
  return xs[0]![0];
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Dataset {
  today: string;
  tickets: Ticket[];
  customers: { id: string; company: string; name: string }[];
}

let cache: Dataset | undefined;

/** About 650 tickets per company over the last 120 days, stable for the whole UTC day. */
export function dataset(now: Date): Dataset {
  const today = todayIn(now, "UTC");
  if (cache?.today === today) return cache;
  const customers = ACCOUNTS.flatMap((a) =>
    CUSTOMER_NAMES[a.id]!.map((name, i) => ({ id: `${a.id}_cus_${i + 1}`, company: a.id, name })),
  );
  const tickets: Ticket[] = [];
  ACCOUNTS.forEach((a, ai) => {
    const r = rng(1337 + ai * 7919 + Number(today.replace(/-/g, "")));
    const mine = customers.filter((c) => c.company === a.id);
    for (let i = 0; i < 650; i++) {
      const category = weighted<Ticket["category"]>(r, [["billing", 4], ["technical", 4], ["sales", 2], ["account", 2]]);
      const age = Math.floor(Math.pow(r(), 1.6) * 120); // more recent tickets than old ones
      const status = age < 7 ? weighted<Ticket["status"]>(r, [["open", 6], ["pending", 3], ["closed", 2]]) : weighted<Ticket["status"]>(r, [["open", 2], ["pending", 2], ["closed", 7]]);
      const cust = pick(r, mine);
      tickets.push({
        id: `${a.id.slice(0, 2).toUpperCase()}-${String(1000 + i)}`,
        company: a.id,
        subject: pick(r, SUBJECTS[category]),
        status,
        priority: weighted<Ticket["priority"]>(r, [["low", 3], ["medium", 5], ["high", 2]]),
        category,
        channel: weighted<Ticket["channel"]>(r, [["email", 5], ["chat", 4], ["phone", 1]]),
        escalated: r() < 0.12,
        amount: category === "billing" || category === "sales" ? Math.round(r() * r() * 4000) : 0,
        createdAt: addDays(today, -age),
        customerId: cust.id,
        customer: cust.name,
      });
    }
  });
  tickets.sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : x.id.localeCompare(y.id)));
  cache = { today, tickets, customers };
  return cache;
}

export interface Session {
  account: Account;
  now: Date;
}

export const helpdesk = defineSearch({
  resource: "tickets",
  version: "helpdesk.v1",
  fields: {
    status: enumField({
      open: "new or active, still open, unresolved",
      pending: "waiting on the customer, on hold",
      closed: "resolved, done, finished",
    }),
    priority: enumField({
      low: "minor, not urgent",
      medium: "normal",
      high: "urgent, critical, P1, asap",
    }),
    category: enumField({
      billing: "charges, invoices, refunds, payments",
      technical: "bugs, outages, errors, login problems, crashes",
      sales: "quotes, pricing, upgrades, plans",
      account: "ownership, teammates, permissions, account settings",
    }),
    channel: enumField({ email: null, chat: "live chat", phone: "call" }),
    escalated: booleanField({ description: "the ticket was escalated to a manager" }),
    amount: numberField({ label: "amount", description: "disputed, refunded, or quoted amount on the ticket", unit: "USD" }),
    createdAt: dateField({ label: "created", description: "when the ticket was opened" }),
    customer: entityField<Session>({
      description: "the customer who raised the ticket",
      resolve: (phrase, s) => findCustomers(phrase, s),
      verify: (id, s) => dataset(s.now).customers.some((c) => c.id === id && c.company === s.account.id),
    }),
  },
});

export type HelpdeskFilters = Filters<typeof helpdesk.fields>;

/** Scope first (the signed-in company), then match the phrase against names. */
export function findCustomers(phrase: string, s: Session) {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  return dataset(s.now)
    .customers.filter((c) => c.company === s.account.id)
    .filter((c) => {
      const name = c.name.toLowerCase().split(" ");
      return words.every((w) => name.some((n) => n.startsWith(w)));
    })
    .map((c) => ({ id: c.id, label: c.name }));
}

/** The "existing API": scope is an outer AND from the session; filters are mapped explicitly. */
export function listTickets(f: HelpdeskFilters, s: Session): { rows: Ticket[]; total: number } {
  const is = <T extends string>(v: T, want: T | { not: T } | undefined) =>
    want === undefined || (typeof want === "string" ? v === want : v !== want.not);
  const inRange = (v: number, r: NonNullable<HelpdeskFilters["amount"]>) =>
    (r.eq === undefined || v === r.eq) && (r.gt === undefined || v > r.gt) && (r.gte === undefined || v >= r.gte) &&
    (r.lt === undefined || v < r.lt) && (r.lte === undefined || v <= r.lte);

  const matches = dataset(s.now)
    .tickets.filter((t) => t.company === s.account.id)
    .filter((t) => is(t.status, f.status))
    .filter((t) => is(t.priority, f.priority))
    .filter((t) => is(t.category, f.category))
    .filter((t) => is(t.channel, f.channel))
    .filter((t) => f.escalated === undefined || t.escalated === f.escalated)
    .filter((t) => !f.amount || inRange(t.amount, f.amount))
    .filter((t) => !f.createdAt || ((!f.createdAt.gte || t.createdAt >= f.createdAt.gte) && (!f.createdAt.lt || t.createdAt < f.createdAt.lt)))
    .filter((t) => !f.customer || t.customerId === f.customer);
  return { rows: matches.slice(0, 50), total: matches.length };
}
