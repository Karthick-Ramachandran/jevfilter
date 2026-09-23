/**
 * JevFilter on top of an existing Postgres database: a multi-tenant B2B order desk.
 *
 * This is the file to copy. It has the three pieces an adopter writes:
 *   1. `buildOrderSchema`: describe the columns you already filter on.
 *   2. `findCustomers`:    a scoped, parameterized lookup for names.
 *   3. `searchOrders`:     map validated filters to SQL explicitly, column by column.
 *
 * The model never sees this SQL, the table names, or any row. It only sees the search text and the
 * field descriptions below.
 */
import type pg from "pg";
import {
  booleanField,
  createNaturalFilter,
  dateField,
  defineSearch,
  entityField,
  enumField,
  numberField,
  type EntityCandidate,
  type FilterProvider,
  type Filters,
} from "../../src/index.ts";

/**
 * Trusted, server-derived session. In a real app this comes from your auth middleware
 * (cookie, JWT). Never build it from the request body or from filters.
 */
export interface Session {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  /** IANA zone. "last month" and "this week" are calendar periods in this zone. */
  timeZone: string;
  canSearchOrders: boolean;
}

// ---------- 1. Describe the columns ----------

const STATUS = {
  pending: "placed but not picked up by the warehouse yet, new, awaiting confirmation",
  processing: "being picked and packed in the warehouse, in progress, stuck, not shipped yet",
  shipped: "handed to the carrier, in transit, on the way",
  delivered: "received by the customer, arrived, completed",
  cancelled: "cancelled or voided before it shipped",
  refunded: "the order was returned or refunded",
} as const;

const PAYMENT_STATUS = {
  paid: "payment captured, settled",
  unpaid: "not paid yet, outstanding, awaiting payment, open or overdue invoice",
  refunded: "the whole payment was given back",
  partially_refunded: "part of the payment was given back, partial refund",
} as const;

const CHANNEL = {
  web: "the website, online store, desktop checkout",
  mobile: "the mobile app, iOS or Android app",
  marketplace: "a third-party marketplace listing",
  phone: "phoned in, call center, telephone order, placed by a sales rep",
} as const;

const SHIPPING_METHOD = {
  standard: "regular, ground, economy shipping",
  express: "expedited, fast, 2-day shipping",
  overnight: "next-day, next day, rush shipping",
} as const;

const COUNTRY = {
  US: "United States, USA, US, America, American",
  CA: "Canada, CA, Canadian",
  GB: "United Kingdom, UK, GB, Great Britain, England, Scotland, British",
  DE: "Germany, DE, German, Deutschland",
  FR: "France, FR, French",
  NL: "Netherlands, NL, Holland, Dutch",
  ES: "Spain, ES, Spanish",
  IT: "Italy, IT, Italian",
  AU: "Australia, AU, Australian",
  JP: "Japan, JP, Japanese",
} as const;

export function buildOrderSchema(db: pg.Pool) {
  return defineSearch({
    // "orders" is not one of the enum values, so Jev never mistakes the record type for a filter.
    resource: "orders",
    version: "orders.v1",
    fields: {
      status: enumField(STATUS, { label: "order status", description: "where the order is in fulfillment" }),
      paymentStatus: enumField(PAYMENT_STATUS, { label: "payment status", description: "whether the customer has paid" }),
      channel: enumField(CHANNEL, { label: "sales channel", description: "where the order was placed" }),
      shippingMethod: enumField(SHIPPING_METHOD, { label: "shipping method", description: "delivery speed chosen at checkout" }),
      country: enumField(COUNTRY, { label: "ship-to country", description: "the country the order ships to" }),
      isGift: booleanField({ label: "gift", description: "the order is marked as a gift (gift wrap or gift message)" }),
      isB2b: booleanField({ label: "business order", description: "placed by a business account (B2B), usually on invoice terms" }),
      total: numberField({ label: "order total", description: "order total including shipping", unit: "USD" }),
      createdAt: dateField({ label: "placed", description: "when the order was placed" }),
      customer: entityField<Session>({
        description: "the customer (buyer) who placed the order",
        resolve: (phrase, session) => findCustomers(db, phrase, session),
        verify: (id, session) => customerVisible(db, id, session),
      }),
    },
  });
}

export type OrderSchema = ReturnType<typeof buildOrderSchema>;
export type OrderFilters = Filters<OrderSchema["fields"]>;

// ---------- 2. Resolve names inside the tenant ----------

/** Escape LIKE wildcards so a phrase like "50%" is matched literally. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Called with a phrase Jev picked out of the user's own text (for example "Sam"). The tenant comes
 * from the session, the phrase is a parameter, and at most 20 candidates come back. One match binds;
 * several become a "Which customer did you mean?" question. The labels never go to the model.
 */
export async function findCustomers(db: pg.Pool, phrase: string, session: Session): Promise<EntityCandidate[]> {
  const needle = phrase.trim().slice(0, 100);
  if (!needle) return [];
  const { rows } = await db.query<{ id: string; first_name: string; last_name: string; company: string | null; city: string }>(
    `SELECT id, first_name, last_name, company, city
       FROM customers
      WHERE tenant_id = $1
        AND (first_name ILIKE $2 ESCAPE '\\'
             OR last_name ILIKE $2 ESCAPE '\\'
             OR (first_name || ' ' || last_name) ILIKE $2 ESCAPE '\\'
             OR company ILIKE $3 ESCAPE '\\')
      ORDER BY (lower(first_name) = lower($4) OR lower(first_name || ' ' || last_name) = lower($4)) DESC,
               last_name, first_name, id
      LIMIT 20`,
    [session.tenantId, `${likeEscape(needle)}%`, `%${likeEscape(needle)}%`, needle],
  );
  return rows.map((r) => ({
    id: r.id,
    label: `${r.first_name} ${r.last_name}${r.company ? `, ${r.company}` : ""} · ${r.city}`,
  }));
}

/** Re-checked on every execute: the id from the browser must still belong to this tenant. */
export async function customerVisible(db: pg.Pool, id: string, session: Session): Promise<boolean> {
  if (!/^cus_[0-9a-f]{8}$/.test(id)) return false;
  const { rowCount } = await db.query("SELECT 1 FROM customers WHERE id = $1 AND tenant_id = $2", [id, session.tenantId]);
  return rowCount === 1;
}

// ---------- 3. Map validated filters to SQL, explicitly ----------

/**
 * The allowlist. Each filter field maps to exactly one column, and we record whether that column
 * can be NULL so `{ not: X }` has a defined meaning (see NULL POLICY below).
 * Nothing outside this table can reach the WHERE clause.
 */
const ENUM_COLUMNS = {
  status: { column: "o.status", nullable: false, values: Object.keys(STATUS) },
  paymentStatus: { column: "o.payment_status", nullable: false, values: Object.keys(PAYMENT_STATUS) },
  channel: { column: "o.channel", nullable: false, values: Object.keys(CHANNEL) },
  shippingMethod: { column: "o.shipping_method", nullable: true, values: Object.keys(SHIPPING_METHOD) },
  country: { column: "o.country_code", nullable: false, values: Object.keys(COUNTRY) },
} as const;
const BOOLEAN_COLUMNS = { isGift: "o.is_gift", isB2b: "o.is_b2b" } as const;
const NUMBER_OPS = { eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;

export interface SqlQuery {
  text: string;
  params: unknown[];
}

/**
 * Builds the WHERE clause. Every value becomes a `$n` parameter; only column names and operators
 * from the tables above are written into the SQL text.
 *
 * NULL POLICY: `{ not: X }` means "everything except X, including rows where the value is not set".
 *   - NOT NULL columns:  col <> $n
 *   - nullable columns:  (col <> $n OR col IS NULL)
 *   Plain SQL `<>` silently drops NULLs, so "everything except express" would lose orders that have
 *   no shipping method yet. Change the nullable flag if your product wants the other meaning.
 *
 * DATES: `{ gte, lt }` are calendar dates in the tenant's time zone (session.timeZone). Each bound
 *   becomes `($n::date::timestamp AT TIME ZONE $tz)`, the instant local midnight starts there.
 *
 * TENANT: `o.tenant_id = $1` from the session is always the first condition, ANDed outside the
 *   filter conditions. Filters cannot name or change it.
 */
export function buildWhere(f: OrderFilters, session: Session): { where: string; params: unknown[] } {
  const params: unknown[] = [session.tenantId]; // $1, always
  const param = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const conds: string[] = [];

  for (const key of Object.keys(ENUM_COLUMNS) as (keyof typeof ENUM_COLUMNS)[]) {
    const v = f[key];
    if (v === undefined) continue;
    const { column, nullable, values } = ENUM_COLUMNS[key];
    const value = typeof v === "string" ? v : v.not;
    // validateFilters already checked this; checking again costs nothing.
    if (!(values as readonly string[]).includes(value)) throw new Error(`Unexpected ${key} value`);
    if (typeof v === "string") conds.push(`${column} = ${param(value)}`);
    else if (nullable) conds.push(`(${column} <> ${param(value)} OR ${column} IS NULL)`);
    else conds.push(`${column} <> ${param(value)}`);
  }

  for (const key of Object.keys(BOOLEAN_COLUMNS) as (keyof typeof BOOLEAN_COLUMNS)[]) {
    const v = f[key];
    if (v === undefined) continue;
    if (typeof v !== "boolean") throw new Error(`Unexpected ${key} value`);
    conds.push(`${BOOLEAN_COLUMNS[key]} = ${param(v)}`);
  }

  if (f.total) {
    // Users speak in dollars; the column stores cents.
    for (const op of Object.keys(NUMBER_OPS) as (keyof typeof NUMBER_OPS)[]) {
      const v = f.total[op];
      if (v === undefined) continue;
      if (!Number.isFinite(v)) throw new Error("Unexpected total value");
      conds.push(`o.total_cents ${NUMBER_OPS[op]} ${param(Math.round(v * 100))}`);
    }
  }

  if (f.createdAt) {
    const tz = param(session.timeZone);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (f.createdAt.gte) {
      if (!iso.test(f.createdAt.gte)) throw new Error("Unexpected date");
      conds.push(`o.created_at >= (${param(f.createdAt.gte)}::date::timestamp AT TIME ZONE ${tz})`);
    }
    if (f.createdAt.lt) {
      if (!iso.test(f.createdAt.lt)) throw new Error("Unexpected date");
      conds.push(`o.created_at < (${param(f.createdAt.lt)}::date::timestamp AT TIME ZONE ${tz})`);
    }
  }

  if (f.customer !== undefined) conds.push(`o.customer_id = ${param(f.customer)}`);

  const where = `o.tenant_id = $1${conds.length ? ` AND (${conds.join(" AND ")})` : ""}`;
  return { where, params };
}

export interface OrderRow {
  tenant_id: string;
  order_number: string;
  placed: string;
  customer: string;
  status: string;
  payment_status: string;
  channel: string;
  shipping_method: string | null;
  country_code: string;
  total_usd: string;
}

export interface OrderPage {
  total: number;
  rows: OrderRow[];
  sql: SqlQuery;
  countSql: SqlQuery;
}

export function buildOrderQueries(f: OrderFilters, session: Session): { sql: SqlQuery; countSql: SqlQuery } {
  const { where, params } = buildWhere(f, session);
  return {
    sql: {
      text:
        `SELECT o.tenant_id, o.order_number,\n` +
        `       to_char(o.created_at AT TIME ZONE t.time_zone, 'YYYY-MM-DD HH24:MI') AS placed,\n` +
        `       c.first_name || ' ' || c.last_name AS customer,\n` +
        `       o.status, o.payment_status, o.channel, o.shipping_method, o.country_code,\n` +
        `       to_char(o.total_cents / 100.0, 'FM999999990.00') AS total_usd\n` +
        `  FROM orders o\n` +
        `  JOIN customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id\n` +
        `  JOIN tenants t ON t.id = o.tenant_id\n` +
        ` WHERE ${where}\n` +
        ` ORDER BY o.created_at DESC, o.id DESC\n` +
        ` LIMIT 50`,
      params,
    },
    countSql: { text: `SELECT count(*)::int AS total FROM orders o WHERE ${where}`, params: [...params] },
  };
}

/** The executor: your existing read-only query, now fed by validated filters. */
export async function searchOrders(db: pg.Pool, f: OrderFilters, session: Session): Promise<OrderPage> {
  const { sql, countSql } = buildOrderQueries(f, session);
  const [page, count] = await Promise.all([db.query<OrderRow>(sql.text, sql.params), db.query<{ total: number }>(countSql.text, countSql.params)]);
  return { total: count.rows[0]?.total ?? 0, rows: page.rows, sql, countSql };
}

/** Looks up the tenant for a login. Stand-in for your auth middleware. */
export async function loadSession(db: pg.Pool, tenantSlug: string, userId = "operator"): Promise<Session | null> {
  const { rows } = await db.query<{ id: string; slug: string; name: string; time_zone: string }>(
    "SELECT id, slug, name, time_zone FROM tenants WHERE slug = $1",
    [tenantSlug],
  );
  const t = rows[0];
  if (!t) return null;
  return { userId, tenantId: t.id, tenantSlug: t.slug, tenantName: t.name, timeZone: t.time_zone, canSearchOrders: true };
}

export function createOrderFilter(db: pg.Pool, provider: FilterProvider<Session>) {
  return createNaturalFilter({
    schema: buildOrderSchema(db),
    provider,
    authorize: (s: Session) => s?.canSearchOrders === true,
    executor: (filters, session: Session) => searchOrders(db, filters, session),
    // Default zone; prepare() passes the tenant's zone per call so dates match the SQL above.
    timeZone: "UTC",
  });
}
