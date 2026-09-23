// JevFilter store demo. Every server or user string is rendered with textContent, never as HTML.
"use strict";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, ...kids) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k);
  return n;
};

const CATEGORIES = ["sneakers", "running shoes", "boots", "jackets", "backpacks", "t-shirts", "water bottles"];
const COLORS = { black: "#1f2328", white: "#f4f4f0", grey: "#9aa0a6", red: "#d9463b", blue: "#3563c9", green: "#3f8a4f", yellow: "#e8b923" };
const BRANDS = ["Alder", "Kestrel", "Fjell", "Summit", "Lumen", "Northwind"];
const FLAGS = { onSale: "On sale", inStock: "In stock", waterproof: "Waterproof" };
const EXAMPLES = [
  "red running shoes under $100",
  "waterproof jackets on sale",
  "backpacks rated 4.5 or more",
  "gifts under $30 in stock",
  "white sneakers that aren't Kestrel",
  "Kestrel or Alder boots",
];

let filters = {};
let busy = false;

// ---------- theme ----------
try { const t = localStorage.getItem("jf-theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {}
$("theme").addEventListener("click", () => {
  const attr = document.documentElement.getAttribute("data-theme");
  const dark = attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("jf-theme", next); } catch {}
});

// ---------- product pictures (simple silhouettes, tinted by color) ----------
const SHAPES = {
  sneakers: "M8 62 C8 50 18 46 30 44 L46 30 C50 27 56 28 58 32 L64 42 C76 44 90 48 92 58 L92 64 C92 68 88 70 84 70 L12 70 C9 70 8 66 8 62 Z",
  "running shoes": "M6 60 C8 50 20 46 32 44 L50 28 C54 25 60 26 62 30 L68 40 C82 42 94 48 94 58 L94 62 C94 67 90 70 84 70 L12 70 C8 70 6 66 6 60 Z M40 36 L52 44",
  boots: "M30 14 L56 14 L58 44 C72 46 88 50 90 60 L90 66 C90 69 88 70 84 70 L28 70 C24 70 22 68 22 64 L24 44 Z",
  jackets: "M36 14 L50 20 L64 14 L84 24 L92 52 L80 56 L76 42 L76 84 L24 84 L24 42 L20 56 L8 52 L16 24 Z M50 20 L50 84",
  backpacks: "M34 26 C34 16 66 16 66 26 L72 28 C80 30 82 36 82 44 L82 80 C82 84 80 86 76 86 L24 86 C20 86 18 84 18 80 L18 44 C18 36 20 30 28 28 Z M30 52 L70 52 L70 70 L30 70 Z",
  "t-shirts": "M36 14 C40 22 60 22 64 14 L86 24 L78 42 L70 38 L70 86 L30 86 L30 38 L22 42 L14 24 Z",
  "water bottles": "M42 10 L58 10 L58 22 C66 26 68 32 68 40 L68 84 C68 88 66 90 62 90 L38 90 C34 90 32 88 32 84 L32 40 C32 32 34 26 42 22 Z",
};
function picture(p) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", SHAPES[p.category]);
  path.setAttribute("fill", COLORS[p.color]);
  path.setAttribute("stroke", p.color === "white" ? "#b9bab2" : "rgba(0,0,0,0.25)");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

// ---------- chips from the current filters ----------
const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
function rangeText(r, fmt) {
  const parts = [];
  if (r.eq !== undefined) parts.push(`= ${fmt(r.eq)}`);
  if (r.gt !== undefined) parts.push(`over ${fmt(r.gt)}`);
  if (r.gte !== undefined) parts.push(`${fmt(r.gte)} or more`);
  if (r.lt !== undefined) parts.push(`under ${fmt(r.lt)}`);
  if (r.lte !== undefined) parts.push(`up to ${fmt(r.lte)}`);
  return parts.join(", ");
}
function chipText(key, v) {
  if (key === "price") return `Price ${rangeText(v, money)}`;
  if (key === "rating") return `Rating ${rangeText(v, (n) => `${n} stars`)}`;
  if (key in FLAGS) return v ? FLAGS[key] : `Not ${FLAGS[key].toLowerCase()}`;
  const label = { category: "", color: "", brand: "" }[key] ?? `${key} `;
  if (typeof v === "object") return `Not ${v.not}`;
  return `${label}${v}`.replace(/^./, (c) => c.toUpperCase());
}
function renderChips() {
  const box = $("chips");
  box.replaceChildren();
  for (const [k, v] of Object.entries(filters)) {
    const x = el("button", null, "×");
    x.type = "button";
    x.setAttribute("aria-label", `Remove ${chipText(k, v)}`);
    x.addEventListener("click", () => { delete filters[k]; run(); });
    box.append(el("span", "chip", chipText(k, v), x));
  }
  const n = Object.keys(filters).length;
  $("side-count").textContent = n ? String(n) : "";
}

// ---------- the sidebar ----------
function flash(node) { node.classList.remove("flash"); void node.offsetWidth; node.classList.add("flash"); }

function buildSidebar() {
  const cat = $("f-category");
  for (const c of ["any", ...CATEGORIES]) {
    const input = el("input");
    input.type = "radio";
    input.name = "category";
    input.value = c;
    input.addEventListener("change", () => { if (c === "any") delete filters.category; else filters.category = c; run(); });
    cat.append(el("label", "opt", input, c === "any" ? "Any category" : c));
  }
  cat.append(el("div", "excl"));

  const col = $("f-color");
  for (const [name, hex] of Object.entries(COLORS)) {
    const b = el("button", "sw");
    b.type = "button";
    b.dataset.color = name;
    b.title = name;
    b.setAttribute("aria-label", name);
    b.style.background = hex;
    b.addEventListener("click", () => { if (filters.color === name) delete filters.color; else filters.color = name; run(); });
    col.append(b);
  }

  const brand = $("f-brand");
  brand.append(el("option", null, "Any brand"));
  brand.options[0].value = "";
  for (const b of BRANDS) { const o = el("option", null, b); o.value = b; brand.append(o); }
  brand.addEventListener("change", () => { if (brand.value) filters.brand = brand.value; else delete filters.brand; run(); });

  const priceChanged = () => {
    const min = $("f-price-min").value, max = $("f-price-max").value;
    const r = {};
    if (min !== "") r.gte = Number(min);
    if (max !== "") r.lte = Number(max);
    if (Object.keys(r).length) filters.price = r; else delete filters.price;
    run();
  };
  $("f-price-min").addEventListener("change", priceChanged);
  $("f-price-max").addEventListener("change", priceChanged);
  $("f-rating").addEventListener("change", (e) => { if (e.target.value) filters.rating = { gte: Number(e.target.value) }; else delete filters.rating; run(); });

  const flags = $("f-flags");
  for (const [key, label] of Object.entries(FLAGS)) {
    const tri = el("span", "tri");
    tri.dataset.key = key;
    for (const [text, val] of [["Any", undefined], ["Yes", true], ["No", false]]) {
      const b = el("button", null, text);
      b.type = "button";
      b.dataset.val = String(val);
      b.addEventListener("click", () => { if (val === undefined) delete filters[key]; else filters[key] = val; run(); });
      tri.append(b);
    }
    flags.append(el("div", "flag", el("span", null, label), tri));
  }
  $("clear").addEventListener("click", () => { filters = {}; run(); });
}

/** Reflect `filters` in the sidebar. `highlight` flashes what the sentence just set. */
function syncSidebar(highlight) {
  const cat = filters.category;
  for (const input of document.querySelectorAll('input[name="category"]')) {
    input.checked = typeof cat === "string" ? input.value === cat : input.value === "any";
    if (highlight && typeof cat === "string" && input.checked) flash(input.parentElement);
  }
  const excl = document.querySelector("#f-category .excl");
  excl.replaceChildren();
  if (cat && typeof cat === "object") {
    const b = el("button", null, "clear");
    b.type = "button";
    b.addEventListener("click", () => { delete filters.category; run(); });
    excl.append(`Excluding ${cat.not}`, b);
  }
  for (const sw of document.querySelectorAll(".sw")) {
    const on = filters.color === sw.dataset.color;
    sw.setAttribute("aria-pressed", String(on));
    if (highlight && on) flash(sw);
  }
  const brand = $("f-brand");
  brand.value = typeof filters.brand === "string" ? filters.brand : "";
  if (highlight && filters.brand) flash(brand);

  const p = filters.price ?? {};
  const min = p.gte ?? p.gt, max = p.lte ?? p.lt;
  $("f-price-min").value = min ?? "";
  $("f-price-max").value = max ?? "";
  if (highlight && filters.price) { flash($("f-price-min")); flash($("f-price-max")); }
  const r = filters.rating ?? {};
  const rv = r.gte ?? r.gt;
  const sel = $("f-rating");
  sel.value = rv !== undefined && [...sel.options].some((o) => o.value === String(rv)) ? String(rv) : "";
  if (highlight && filters.rating) flash(sel);

  for (const tri of document.querySelectorAll(".tri")) {
    const v = filters[tri.dataset.key];
    for (const b of tri.children) b.setAttribute("aria-pressed", String(b.dataset.val === String(v)));
    if (highlight && v !== undefined) flash(tri);
  }
}

// ---------- products ----------
function renderProducts(products) {
  const grid = $("grid");
  grid.replaceChildren();
  if (!products) {
    $("shelf-meta").textContent = "Nothing ran for this request.";
    grid.append(el("div", "empty", el("strong", null, "No search ran"), "Try one of the examples, or set filters on the left."));
    return;
  }
  $("shelf-meta").textContent = products.total > products.rows.length
    ? `${products.total} products, showing the top ${products.rows.length} by rating`
    : `${products.total} product${products.total === 1 ? "" : "s"}`;
  if (!products.rows.length) {
    grid.append(el("div", "empty", el("strong", null, "No products match"), "The store didn't loosen your filters. Remove a chip to widen the search."));
    return;
  }
  for (const p of products.rows) {
    const pic = el("div", "pic", picture(p));
    if (p.onSale) pic.append(el("span", "badge", "Sale"));
    if (!p.inStock) pic.append(el("span", "badge out", "Sold out"));
    grid.append(el("article", "card", pic, el("div", "card-body",
      el("span", "card-name", p.name),
      el("span", "card-meta", `${p.color} ${p.category}${p.waterproof ? ", waterproof" : ""}`),
      el("div", "card-row", el("span", "price", money(p.price)), el("span", "rating", `${p.rating.toFixed(1)} stars`)))));
  }
}

// ---------- server calls ----------
async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

function verdict(text, cls) {
  const v = $("verdict");
  v.className = `verdict${cls ? ` ${cls}` : ""}`;
  v.replaceChildren(text);
}

function stats(s) {
  const box = $("stats");
  box.replaceChildren();
  if (!s) { box.append(el("span", "stat good", "no model call"), el("span", "stat", "sidebar filters, validated")); return; }
  if (s.cached) {
    box.append(el("span", "stat good", "cached answer, 0 tokens"), el("span", "stat", `${s.ms} ms`), el("span", "stat good", "no SQL written by a model"));
    return;
  }
  box.append(
    el("span", "stat", `${s.modelCalls} model call`),
    el("span", "stat", `${s.inputTokens.toLocaleString()} tokens`),
    el("span", "stat", `about $${s.estimatedUsd.toFixed(5)}`),
    el("span", "stat", `${s.ms} ms`),
    el("span", "stat good", "no SQL written by a model"),
  );
}

/** Nothing ran: drop the previous search's filters so the sidebar and chips don't show stale state. */
function clearAll() {
  filters = {};
  renderChips();
  syncSidebar(false);
  renderProducts(null);
}

async function ask(text) {
  const query = String(text ?? "").trim();
  if (!query || busy) return;
  busy = true;
  $("go").disabled = true;
  $("verdict").replaceChildren(el("span", "thinking", el("span", "pulse"), "Reading your request"));
  try {
    const { ok, status, data } = await post("/api/shop/search", { text: query });
    if (!ok || !data?.result) {
      verdict(data?.error ?? `The search failed (HTTP ${status}).`, "refused");
      clearAll();
      return;
    }
    const r = data.result;
    if (r.status === "ready") {
      filters = { ...r.filters };
      verdict("Understood as:");
      renderChips();
      syncSidebar(true);
      renderProducts(data.products);
    } else if (r.status === "needs_clarification") {
      filters = { ...(r.filters ?? {}) };
      verdict(r.questions.map((q) => q.question).join(" "), "warn");
      renderChips();
      syncSidebar(true);
      renderProducts(null);
    } else {
      verdict(`${r.message ?? "That request can't be searched."} Nothing ran.`, "refused");
      clearAll();
    }
    stats(data.stats);
  } catch {
    verdict("Couldn't reach the demo server. Check your connection and try again.", "refused");
  } finally {
    busy = false;
    $("go").disabled = false;
  }
}

/** Sidebar edits and chip removal: validated on the server, no model call. */
async function run() {
  renderChips();
  syncSidebar(false);
  const { ok, data } = await post("/api/shop/execute", { filters });
  if (!ok || !data) { verdict((data?.errors ?? ["Those filters can't be used."]).join(", "), "refused"); return; }
  verdict(Object.keys(filters).length ? "Your filters:" : "No filters, so every product is shown.");
  renderProducts(data.products);
  stats(null);
}

$("search").addEventListener("submit", (e) => { e.preventDefault(); ask($("q").value); });
for (const t of EXAMPLES) {
  const b = el("button", null, t);
  b.type = "button";
  b.addEventListener("click", () => { $("q").value = t; ask(t); });
  $("examples").append(b);
}
buildSidebar();
if (matchMedia("(max-width: 860px)").matches) $("side").open = false;
const initial = new URLSearchParams(location.search).get("q");
ask(initial ? initial.slice(0, 500) : $("q").value);
