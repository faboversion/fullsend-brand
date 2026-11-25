// Builds shop/catalog.json from the product list in index.html (single source of truth).
// The licence/shop worker loads this file to price orders, so prices can't be changed in the browser.
// usage: node tools/gen_catalog.mjs  (run from the repo root after editing products or prices)
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("index.html", "utf8");
const grab = (re, what) => { const m = html.match(re); if (!m) throw new Error("not found: " + what); return m[0]; };
const T = grab(/const T=\{[\s\S]*?\n\};/, "T");
const P = grab(/const P=\[[\s\S]*?\]\.filter\(p=>!p\.ws\);/, "P");
const Z = grab(/const Z8=.*?;/, "Z8");
const SHOP = grab(/const SHOP=\{[\s\S]*?\n\};/, "SHOP");
const crew = grab(/const CREW_HASH='[0-9a-f]+',CREW_PCT=\d+;/, "CREW");
const crewItem = grab(/const CREW_PCT_ITEM=\{[^}]*\};/, "CREW_PCT_ITEM");
const ship = grab(/const SHIP=\d+;/, "SHIP");
const ctx = {};
vm.createContext(ctx);
vm.runInContext([T, P, Z, SHOP, crew, crewItem, ship].join("\n").replace(/const /g, "var "), ctx);

const prev = fs.existsSync("shop/catalog.json") ? JSON.parse(fs.readFileSync("shop/catalog.json", "utf8")) : {};
const products = {};
for (const p of ctx.P) {
  const s = ctx.SHOP[p.id];
  if (!s) continue;
  products[p.id] = {
    name: p.name,
    chf: s.chf,
    sizes: s.sz || null,             // null = one size
    sizeLabel: s.szLabel || "Size",
    colors: Object.fromEntries(p.v.map((v) => [v.c, v.n])),
    pilot: !!s.pilot,
  };
}
const out = {
  updated: new Date().toISOString().slice(0, 10),
  // pre-order window (Swiss time is UTC+1 in winter). Outside it the worker refuses orders.
  drop: prev.drop || { name: "First Light", open: null, close: null },
  currency: "chf",
  shipping: { chf: ctx.SHIP },
  crew: { sha256: ctx.CREW_HASH, pct: ctx.CREW_PCT, perItem: ctx.CREW_PCT_ITEM },
  products,
};
fs.writeFileSync("shop/catalog.json", JSON.stringify(out, null, 1) + "\n");
console.log(Object.keys(products).length, "products ->", "shop/catalog.json");
