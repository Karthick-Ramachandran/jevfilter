/**
 * The simple demo: a fictional outdoor store. One catalog, no tenants, so the only idea on
 * screen is "type what you want, get the same filters the sidebar would have set".
 */
import {
  booleanField,
  defineSearch,
  enumField,
  numberField,
  type Filters,
} from "../../src/index.ts";

export const CATEGORIES = ["sneakers", "running shoes", "boots", "jackets", "backpacks", "t-shirts", "water bottles"] as const;
export const COLORS = ["black", "white", "grey", "red", "blue", "green", "yellow"] as const;
export const BRANDS = ["Alder", "Kestrel", "Fjell", "Summit", "Lumen", "Northwind"] as const;

export interface Product {
  id: string;
  name: string;
  brand: (typeof BRANDS)[number];
  category: (typeof CATEGORIES)[number];
  color: (typeof COLORS)[number];
  price: number;
  rating: number;
  onSale: boolean;
  inStock: boolean;
  waterproof: boolean;
}

const NOUNS: Record<Product["category"], string[]> = {
  sneakers: ["Court Low", "Street Knit", "Canvas Classic", "Daily Low"],
  "running shoes": ["Trail Runner", "Road Racer", "Tempo 2", "Long Run"],
  boots: ["Ridge Boot", "Hiker Mid", "Chelsea", "Winter Pac"],
  jackets: ["Storm Shell", "Down Parka", "Wind Layer", "Fleece Zip"],
  backpacks: ["Day Pack 22L", "Commuter 18L", "Trek 40L", "Summit 30L"],
  "t-shirts": ["Merino Tee", "Cotton Crew", "Tech Tee", "Pocket Tee"],
  "water bottles": ["Steel 750", "Insulated 1L", "Flip Cap 500", "Trail Flask"],
};
const PRICE: Record<Product["category"], [number, number]> = {
  sneakers: [45, 140], "running shoes": [60, 180], boots: [80, 240], jackets: [50, 320],
  backpacks: [35, 190], "t-shirts": [15, 70], "water bottles": [12, 48],
};

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

function build(): Product[] {
  const r = rng(20260923);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const out: Product[] = [];
  for (let i = 0; i < 640; i++) {
    const category = pick(CATEGORIES);
    const brand = pick(BRANDS);
    const [lo, hi] = PRICE[category];
    const price = Math.round(lo + r() * (hi - lo)) - 0.01;
    out.push({
      id: `P${1000 + i}`,
      name: `${brand} ${pick(NOUNS[category])}`,
      brand,
      category,
      color: pick(COLORS),
      price: Math.max(9.99, Math.round(price * 100) / 100),
      rating: Math.round((3 + r() * 2) * 10) / 10,
      onSale: r() < 0.25,
      inStock: r() < 0.85,
      waterproof: ["boots", "jackets", "backpacks"].includes(category) ? r() < 0.55 : category === "running shoes" && r() < 0.2,
    });
  }
  return out;
}

export const PRODUCTS = build();

export const shop = defineSearch({
  resource: "products",
  version: "shop.v1",
  fields: {
    category: enumField({
      sneakers: "casual shoes, trainers, kicks",
      "running shoes": "runners, jogging shoes, trail shoes",
      boots: "hiking boots, winter boots",
      jackets: "coats, rain jackets, parkas, shells",
      backpacks: "bags, rucksacks, daypacks",
      "t-shirts": "tees, tops, shirts",
      "water bottles": "bottles, flasks",
    }, { label: "category" }),
    color: enumField({
      black: null, white: null, grey: "gray, charcoal", red: "burgundy", blue: "navy", green: "olive", yellow: "mustard",
    }, { label: "color" }),
    brand: enumField(Object.fromEntries(BRANDS.map((b) => [b, null])) as Record<(typeof BRANDS)[number], null>, { label: "brand" }),
    price: numberField({ label: "price", description: "price in US dollars", unit: "USD" }),
    rating: numberField({ label: "rating", description: "average customer rating, 1 to 5 stars" }),
    onSale: booleanField({ label: "on sale", description: "currently discounted, on sale, deals" }),
    inStock: booleanField({ label: "in stock", description: "available to ship now" }),
    waterproof: booleanField({ label: "waterproof", description: "waterproof or water resistant, good for rain" }),
  },
});

export type ShopFilters = Filters<typeof shop.fields>;

/** The store's existing product query: filters map explicitly to fields. */
export function listProducts(f: ShopFilters): { rows: Product[]; total: number } {
  const is = <T extends string>(v: T, want: T | { not: T } | undefined) =>
    want === undefined || (typeof want === "string" ? v === want : v !== want.not);
  const inRange = (v: number, r: NonNullable<ShopFilters["price"]>) =>
    (r.eq === undefined || v === r.eq) && (r.gt === undefined || v > r.gt) && (r.gte === undefined || v >= r.gte) &&
    (r.lt === undefined || v < r.lt) && (r.lte === undefined || v <= r.lte);
  const rows = PRODUCTS.filter((p) => is(p.category, f.category))
    .filter((p) => is(p.color, f.color))
    .filter((p) => is(p.brand, f.brand))
    .filter((p) => !f.price || inRange(p.price, f.price))
    .filter((p) => !f.rating || inRange(p.rating, f.rating))
    .filter((p) => f.onSale === undefined || p.onSale === f.onSale)
    .filter((p) => f.inStock === undefined || p.inStock === f.inStock)
    .filter((p) => f.waterproof === undefined || p.waterproof === f.waterproof)
    .sort((a, b) => b.rating - a.rating || a.price - b.price);
  return { rows: rows.slice(0, 24), total: rows.length };
}
