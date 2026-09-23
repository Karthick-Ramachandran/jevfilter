/**
 * Seeds the order desk with random but reproducible data.
 *
 *   npm run db:seed              → SEED=42 (default)
 *   SEED=7 npm run db:seed       → a different dataset, same every time for SEED=7
 *
 * Dates are generated backwards from today (UTC), so "last month" always has data. The same SEED
 * on the same day produces identical rows. Uses the owner role (SEED_DATABASE_URL); the app itself
 * only ever connects with the read-only role.
 */
import pg from "pg";

const SEED_URL =
  process.env.SEED_DATABASE_URL ?? "postgres://orderdesk_owner:owner_dev_only@127.0.0.1:55432/orderdesk";
const SEED = process.env.SEED ?? "42";

// ---------- seeded PRNG (mulberry32) ----------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
let state = hashSeed(SEED);
function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
function weighted<T extends string>(w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][];
  let r = rand() * entries.reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of entries) if ((r -= v) < 0) return k;
  return entries[entries.length - 1]![0];
}
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");

// ---------- reference data (all fictional) ----------

const COUNTRIES = {
  US: { name: "United States", cities: ["Boston", "Austin", "Denver", "Portland", "Columbus", "Raleigh"] },
  CA: { name: "Canada", cities: ["Toronto", "Calgary", "Halifax", "Ottawa"] },
  GB: { name: "United Kingdom", cities: ["Leeds", "Bristol", "Glasgow", "Norwich"] },
  DE: { name: "Germany", cities: ["Berlin", "Munich", "Hamburg", "Leipzig", "Cologne"] },
  FR: { name: "France", cities: ["Lyon", "Lille", "Nantes", "Bordeaux"] },
  NL: { name: "Netherlands", cities: ["Amsterdam", "Utrecht", "Rotterdam"] },
  ES: { name: "Spain", cities: ["Valencia", "Seville", "Bilbao"] },
  IT: { name: "Italy", cities: ["Turin", "Bologna", "Verona"] },
  AU: { name: "Australia", cities: ["Sydney", "Melbourne", "Perth", "Hobart"] },
  JP: { name: "Japan", cities: ["Osaka", "Fukuoka", "Sapporo"] },
} as const;
type Cc = keyof typeof COUNTRIES;

interface TenantSpec {
  id: string;
  slug: string;
  name: string;
  timeZone: string;
  utcOffset: number; // rough, only used to put orders in local business hours
  prefix: string;
  customers: number;
  orders: number;
  countries: Partial<Record<Cc, number>>;
  /** Hand-placed customers so the "which Sam?" case is deterministic. */
  pinned: [first: string, last: string, city: string, cc: Cc][];
  catalog: [name: string, dollars: number][];
}

const TENANTS: TenantSpec[] = [
  {
    id: "ten_acme", slug: "acme", name: "Acme Supply Co.", timeZone: "America/New_York", utcOffset: -4, prefix: "AC",
    customers: 180, orders: 1100,
    countries: { US: 50, CA: 14, GB: 8, DE: 8, FR: 5, NL: 4, ES: 3, IT: 3, AU: 3, JP: 2 },
    pinned: [["Sam", "Rivera", "Boston", "US"], ["Sam", "Patel", "Austin", "US"], ["Sam", "Okafor", "Toronto", "CA"],
      ["Samantha", "Reyes", "Denver", "US"], ["Samuel", "Brooks", "Berlin", "DE"]],
    catalog: [["Shop vacuum 12 gal", 189], ["Cordless drill kit", 149], ["Safety glasses 12-pack", 36], ["Work gloves 24-pack", 58],
      ["Pallet jack", 640], ["Shelving unit steel", 230], ["Label printer", 119], ["Packing tape 36 rolls", 42],
      ["Hand truck", 175], ["LED shop light", 64], ["Tool chest 7-drawer", 420], ["Extension cord 50 ft", 29],
      ["Air compressor 6 gal", 210], ["Stretch wrap 4 rolls", 48], ["Floor scale 600 lb", 340], ["Ladder 8 ft", 155]],
  },
  {
    id: "ten_nordwind", slug: "nordwind", name: "Nordwind Handel GmbH", timeZone: "Europe/Berlin", utcOffset: 2, prefix: "NW",
    customers: 150, orders: 950,
    countries: { DE: 45, NL: 12, FR: 10, IT: 7, ES: 6, GB: 8, US: 6, CA: 2, AU: 2, JP: 2 },
    pinned: [["Sam", "Weber", "Berlin", "DE"], ["Sam", "Keller", "Munich", "DE"], ["Sam", "Rivera", "Amsterdam", "NL"],
      ["Samira", "Haddad", "Hamburg", "DE"]],
    catalog: [["Espresso machine", 480], ["Burr grinder", 210], ["Milk frother", 65], ["Tamper steel", 34],
      ["Coffee beans 1 kg", 28], ["Descaler 6-pack", 22], ["Cup set 12", 54], ["Barista apron", 31],
      ["Knock box", 39], ["Water filter 3-pack", 27], ["Commercial kettle", 145], ["Bean hopper", 88]],
  },
  {
    id: "ten_bluefern", slug: "bluefern", name: "Bluefern Outfitters", timeZone: "Australia/Sydney", utcOffset: 10, prefix: "BF",
    customers: 130, orders: 800,
    countries: { AU: 55, JP: 10, US: 12, GB: 6, CA: 5, DE: 4, NL: 2, FR: 2, ES: 2, IT: 2 },
    pinned: [["Sam", "Nguyen", "Sydney", "AU"], ["Sam", "Rivers", "Perth", "AU"], ["Sammy", "Rivera", "Melbourne", "AU"]],
    catalog: [["Trail tent 2p", 360], ["Sleeping bag -5C", 220], ["Hiking boots", 190], ["Rain shell", 240],
      ["Headlamp", 45], ["Trekking poles", 95], ["Camp stove", 110], ["Water filter", 70],
      ["Daypack 28 L", 130], ["Merino base layer", 85], ["Dry bag set", 40], ["Camp chair", 75]],
  },
  {
    id: "ten_kestrel", slug: "kestrel", name: "Kestrel Office Goods", timeZone: "Europe/London", utcOffset: 1, prefix: "KS",
    customers: 120, orders: 750,
    countries: { GB: 55, FR: 8, DE: 8, NL: 6, ES: 5, IT: 5, US: 7, CA: 2, AU: 2, JP: 2 },
    pinned: [["Sam", "Okafor", "Leeds", "GB"], ["Samira", "Bell", "Bristol", "GB"]],
    catalog: [["Ergonomic chair", 420], ["Standing desk", 690], ["Monitor arm", 120], ["Printer paper 10 reams", 55],
      ["Toner cartridge", 89], ["Desk lamp", 48], ["Whiteboard 6 ft", 160], ["Filing cabinet", 230],
      ["Headset", 99], ["Notebook 20-pack", 38], ["Shredder", 175], ["Meeting table", 880]],
  },
];

const FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Parker",
  "Maria", "Elena", "Lena", "Hannah", "Nora", "Priya", "Aisha", "Mei", "Yuki", "Chloe", "Emma", "Sofia",
  "Lucas", "Noah", "Liam", "Mateo", "Jonas", "Felix", "Omar", "Ravi", "Kenji", "Tom", "Ben", "Daniel",
  "Grace", "Ivy", "Zoe", "Leo", "Max", "Ana", "Tariq", "Nadia", "Oscar", "Hugo", "Clara", "Ines", "Paul", "Rosa"];
const LAST = ["Rivera", "Riviera", "Rivers", "Meyer", "Meier", "Mayer", "Nguyen", "Patel", "Okafor", "Keller",
  "Weber", "Fischer", "Brooks", "Reyes", "Santos", "Moreau", "Dubois", "Rossi", "Bianchi", "Tanaka", "Sato",
  "Walsh", "Murphy", "Hughes", "Clarke", "Singh", "Khan", "Novak", "Larsen", "Jansen", "de Vries", "Costa",
  "Lopez", "Garcia", "Kim", "Park", "Chen", "Wong", "Evans", "Price", "Holt", "Marsh", "Doyle", "Fraser"];
const COMPANIES = ["Brightline Studio", "Harbor & Pine", "Northgate Labs", "Copperleaf Ltd", "Tidewater Works",
  "Oakridge Partners", "Lumen Fabrication", "Greyfield Logistics", "Maple Row Cafe", "Fieldstone Build",
  "Silverbirch Clinic", "Redwing Print", "Quarry Street Bakery", "Blue Anchor Marine", "Kitefield Schools"];

// ---------- generation ----------

const DAY = 86_400_000;
const anchor = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());

type Row = unknown[];
const tenants: Row[] = [];
const customers: Row[] = [];
const products: Row[] = [];
const orders: Row[] = [];
const items: Row[] = [];
const usedIds = new Set<string>();
const newId = (prefix: string) => {
  for (;;) {
    const id = `${prefix}_${hex(8)}`;
    if (!usedIds.has(id)) return usedIds.add(id), id;
  }
};

let orderId = 0;
for (const t of TENANTS) {
  tenants.push([t.id, t.slug, t.name, t.timeZone]);

  const custs: { id: string; cc: Cc; b2b: boolean }[] = [];
  const addCustomer = (first: string, last: string, city: string, cc: Cc) => {
    const b2b = rand() < 0.35;
    const id = newId("cus");
    const company = b2b ? pick(COMPANIES) : null;
    const email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `${int(1, 99)}@example.com`;
    const joined = new Date(anchor - int(200, 900) * DAY).toISOString();
    customers.push([id, t.id, first, last, company, email, city, cc, joined]);
    custs.push({ id, cc, b2b });
  };
  for (const [f, l, city, cc] of t.pinned) addCustomer(f, l, city, cc);
  while (custs.length < t.customers) {
    const cc = weighted(t.countries as Record<Cc, number>);
    addCustomer(pick(FIRST), pick(LAST), pick(COUNTRIES[cc].cities), cc);
  }

  const catalog = t.catalog.map(([name, dollars], i) => {
    const id = newId("prd");
    const price = dollars * 100 - (rand() < 0.5 ? 1 : 0); // a few .99 prices
    products.push([id, t.id, `${t.prefix}-${String(100 + i)}`, name, price]);
    return { id, price };
  });

  // A few customers place most orders (realistic skew): weight ~ 1/rank.
  const custWeights = custs.map((_, i) => 1 / (1 + i * 0.15));
  const custTotal = custWeights.reduce((a, b) => a + b, 0);
  const pickCustomer = () => {
    let r = rand() * custTotal;
    for (let i = 0; i < custs.length; i++) if ((r -= custWeights[i]!) < 0) return custs[i]!;
    return custs[custs.length - 1]!;
  };

  const tenantOrders: { created: number; row: Row; items: Row[] }[] = [];
  while (tenantOrders.length < t.orders) {
    // Recent days are busier (growth), weekends quieter, business hours in the tenant's zone.
    const ageDays = Math.floor(180 * Math.pow(rand(), 1.35));
    const day = anchor - ageDays * DAY;
    const weekday = new Date(day).getUTCDay();
    if ((weekday === 0 || weekday === 6) && rand() < 0.55) continue;
    const localHour = Math.min(23, Math.max(0, Math.round(8 + rand() * 11 + (rand() - 0.5) * 4)));
    const created = day + (localHour - t.utcOffset) * 3_600_000 + int(0, 3599) * 1000;
    if (created > Date.now()) continue;
    const ageH = (Date.now() - created) / 3_600_000;

    const cust = pickCustomer();
    const isB2b = cust.b2b && rand() < 0.85;
    const status = ageH < 36
      ? weighted({ pending: 45, processing: 45, cancelled: 6, shipped: 4 })
      : ageH < 24 * 7
        ? weighted({ pending: 6, processing: 30, shipped: 44, delivered: 12, cancelled: 6, refunded: 2 })
        : weighted({ processing: 1.5, shipped: 5, delivered: 78, cancelled: 7, refunded: 8.5 });
    const payment =
      status === "refunded" ? weighted({ refunded: 75, partially_refunded: 25 })
      : status === "cancelled" ? weighted({ unpaid: 55, refunded: 45 })
      : status === "pending" ? weighted({ unpaid: 60, paid: 40 })
      : isB2b ? weighted({ paid: 70, unpaid: 25, partially_refunded: 5 }) // net-30 invoices
      : weighted({ paid: 95, partially_refunded: 4, unpaid: 1 });
    const shipping =
      (status === "pending" && rand() < 0.35) || (status === "cancelled" && rand() < 0.45)
        ? null
        : weighted({ standard: 64, express: 26, overnight: 10 });
    const channel = isB2b
      ? weighted({ web: 40, phone: 35, marketplace: 10, mobile: 15 })
      : weighted({ web: 42, mobile: 33, marketplace: 20, phone: 5 });
    // Ship-to country is usually the customer's own, sometimes elsewhere.
    const cc: Cc = rand() < 0.85 ? cust.cc : weighted(t.countries as Record<Cc, number>);

    orderId++;
    const lines: Row[] = [];
    let total = 0;
    const nLines = weighted({ 1: 40, 2: 30, 3: 18, 4: 8, 5: 4 } as Record<string, number>);
    for (let i = 0; i < Number(nLines); i++) {
      const p = pick(catalog);
      const qty = isB2b ? int(1, rand() < 0.2 ? 40 : 8) : rand() < 0.8 ? 1 : int(2, 3);
      total += p.price * qty;
      lines.push([orderId, p.id, qty, p.price]);
    }
    total += shipping === "overnight" ? 3500 : shipping === "express" ? 1500 : shipping === "standard" && total < 5000 ? 695 : 0;

    tenantOrders.push({
      created,
      items: lines,
      row: [orderId, t.id, "", cust.id, status, payment, channel, shipping, cc, COUNTRIES[cc].name, "USD",
        total, !isB2b && rand() < 0.07, isB2b, new Date(created).toISOString()],
    });
  }
  // Order numbers increase with time, like a real sequence.
  tenantOrders.sort((a, b) => a.created - b.created);
  tenantOrders.forEach((o, i) => {
    o.row[2] = `${t.prefix}-${100001 + i}`;
    orders.push(o.row);
    items.push(...o.items);
  });
}

// ---------- write ----------

async function insert(client: pg.PoolClient, table: string, cols: string[], rows: Row[], overriding = false) {
  const perBatch = Math.floor(60_000 / cols.length);
  for (let i = 0; i < rows.length; i += perBatch) {
    const batch = rows.slice(i, i + perBatch);
    const params: unknown[] = [];
    const tuples = batch.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(",")})`);
    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) ${overriding ? "OVERRIDING SYSTEM VALUE " : ""}VALUES ${tuples.join(",")}`,
      params,
    );
  }
}

const pool = new pg.Pool({ connectionString: SEED_URL, max: 1 });
const client = await pool.connect();
const t0 = performance.now();
try {
  await client.query("BEGIN");
  await client.query("TRUNCATE order_items, orders, products, customers, tenants RESTART IDENTITY CASCADE");
  await insert(client, "tenants", ["id", "slug", "name", "time_zone"], tenants);
  await insert(client, "customers", ["id", "tenant_id", "first_name", "last_name", "company", "email", "city", "country_code", "created_at"], customers);
  await insert(client, "products", ["id", "tenant_id", "sku", "name", "price_cents"], products);
  await insert(client, "orders", ["id", "tenant_id", "order_number", "customer_id", "status", "payment_status", "channel",
    "shipping_method", "country_code", "country_name", "currency", "total_cents", "is_gift", "is_b2b", "created_at"], orders, true);
  await insert(client, "order_items", ["order_id", "product_id", "quantity", "unit_price_cents"], items);
  await client.query("SELECT setval(pg_get_serial_sequence('orders', 'id'), (SELECT max(id) FROM orders))");
  await client.query("COMMIT");
  await client.query("ANALYZE");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
console.log(
  `Seeded SEED=${SEED}: ${tenants.length} tenants, ${customers.length} customers, ${products.length} products, ` +
    `${orders.length} orders, ${items.length} order items in ${Math.round(performance.now() - t0)} ms.`,
);
