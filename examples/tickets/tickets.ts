/**
 * Reference integration: support tickets with an in-memory "existing API".
 * Swap `listTickets` and `findCustomers` for your real endpoint or query.
 */
import {
  booleanField,
  createNaturalFilter,
  dateField,
  defineSearch,
  entityField,
  enumField,
  numberField,
  type FilterProvider,
  type Filters,
} from "../../src/index.ts";

/** Trusted, server-derived session. Never built from the request body. */
export interface Session {
  userId: string;
  workspaceId: string;
  canSearchTickets: boolean;
}

export interface Ticket {
  id: string;
  workspaceId: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "medium" | "high";
  category: "billing" | "sales" | "support";
  escalated: boolean;
  amount: number;
  createdAt: string;
  customerId: string;
}

export const CUSTOMERS = [
  { id: "cus_1", workspaceId: "ws_acme", name: "Sam Wilson" },
  { id: "cus_2", workspaceId: "ws_acme", name: "Sam Kumar" },
  { id: "cus_3", workspaceId: "ws_acme", name: "Sam Thomas" },
  { id: "cus_4", workspaceId: "ws_acme", name: "Priya Raman" },
  { id: "cus_5", workspaceId: "ws_other", name: "Sam Other-Tenant" },
];

export const TICKETS: Ticket[] = [
  { id: "t1", workspaceId: "ws_acme", subject: "Charged twice", status: "open", priority: "high", category: "billing", escalated: true, amount: 120, createdAt: "2026-09-15", customerId: "cus_1" },
  { id: "t2", workspaceId: "ws_acme", subject: "Invoice copy", status: "closed", priority: "low", category: "billing", escalated: false, amount: 40, createdAt: "2026-08-12", customerId: "cus_2" },
  { id: "t3", workspaceId: "ws_acme", subject: "Enterprise quote", status: "pending", priority: "medium", category: "sales", escalated: false, amount: 9000, createdAt: "2026-09-20", customerId: "cus_4" },
  { id: "t4", workspaceId: "ws_acme", subject: "Login broken", status: "open", priority: "high", category: "support", escalated: true, amount: 0, createdAt: "2026-09-22", customerId: "cus_3" },
  { id: "t5", workspaceId: "ws_acme", subject: "Refund request", status: "open", priority: "high", category: "billing", escalated: false, amount: 480, createdAt: "2026-08-30", customerId: "cus_4" },
  { id: "t6", workspaceId: "ws_other", subject: "Other tenant secret", status: "open", priority: "high", category: "billing", escalated: true, amount: 100, createdAt: "2026-09-15", customerId: "cus_5" },
];

export async function findCustomers(phrase: string, session: Session) {
  const needle = phrase.toLowerCase();
  return CUSTOMERS.filter((c) => c.workspaceId === session.workspaceId) // scope first
    .filter((c) => c.name.toLowerCase().includes(needle))
    .map((c) => ({ id: c.id, label: c.name }));
}

export const ticketSearch = defineSearch({
  // Not "support tickets": "support" is also a category value, which makes requests ambiguous.
  resource: "tickets",
  version: "tickets.v1",
  fields: {
    status: enumField({
      open: "new or active tickets, still open",
      pending: "waiting on the customer",
      closed: "resolved, done, finished",
    }),
    priority: enumField({
      low: "minor, not urgent",
      medium: "normal",
      high: "urgent, critical, P1, asap",
    }),
    category: enumField({
      billing: "charges, invoices, refunds, payments",
      sales: "quotes, pricing, upgrades",
      support: "technical problems, bugs, login issues",
    }),
    escalated: booleanField({ description: "the ticket was escalated to a manager" }),
    amount: numberField({ label: "amount", description: "disputed or quoted amount on the ticket", unit: "USD" }),
    createdAt: dateField({ label: "created", description: "when the ticket was opened" }),
    customer: entityField<Session>({
      description: "the customer who raised the ticket",
      resolve: findCustomers,
      verify: (id, s) => CUSTOMERS.some((c) => c.id === id && c.workspaceId === s.workspaceId),
    }),
  },
});

export type TicketFilters = Filters<typeof ticketSearch.fields>;

/** Your existing read-only API. Scope comes from the session and is applied first. */
export async function listTickets(f: TicketFilters, session: Session): Promise<Ticket[]> {
  const inRange = (v: number, r: NonNullable<TicketFilters["amount"]>) =>
    (r.eq === undefined || v === r.eq) &&
    (r.gt === undefined || v > r.gt) &&
    (r.gte === undefined || v >= r.gte) &&
    (r.lt === undefined || v < r.lt) &&
    (r.lte === undefined || v <= r.lte);
  const is = <T extends string>(v: T, want: T | { not: T } | undefined) =>
    want === undefined || (typeof want === "string" ? v === want : v !== want.not);

  return TICKETS.filter((t) => t.workspaceId === session.workspaceId) // outer AND: tenant scope
    .filter((t) => is(t.status, f.status))
    .filter((t) => is(t.priority, f.priority))
    .filter((t) => is(t.category, f.category))
    .filter((t) => f.escalated === undefined || t.escalated === f.escalated)
    .filter((t) => !f.amount || inRange(t.amount, f.amount))
    .filter((t) => !f.createdAt || ((!f.createdAt.gte || t.createdAt >= f.createdAt.gte) && (!f.createdAt.lt || t.createdAt < f.createdAt.lt)))
    .filter((t) => !f.customer || t.customerId === f.customer)
    .slice(0, 20);
}

export function createTicketFilter(provider: FilterProvider<Session>) {
  return createNaturalFilter({
    schema: ticketSearch,
    provider,
    authorize: (s: Session) => s.canSearchTickets,
    executor: listTickets,
    timeZone: "UTC",
  });
}
