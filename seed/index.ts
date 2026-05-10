/**
 * Seed: realistic Crazy Brownies bakery data
 * - 5 suppliers, ~20 ingredients, ~10 products with full recipes
 * - 30 days of order history with weekend bumps + a trending product
 * - All inventory mutations recorded in stock_movements (the real production pattern)
 *
 * Run: npm run db:seed
 * Idempotent: wipes the data tables first (NOT auth.users / profiles).
 */

import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

// ─── Reference data ──────────────────────────────────────────────────────────

const SUPPLIERS = [
  { name: "Belgian Chocolate Co. Dubai", contact_name: "Karim Hassan", phone: "+971 4 555 0101", email: "orders@belgianchoco.ae" },
  { name: "Al Khaleej Sugar", contact_name: "Reem Al-Mansoori", phone: "+971 4 555 0202", email: "sales@alkhaleej.ae" },
  { name: "Emirates Co-op Wholesale", contact_name: "Faisal Akhtar", phone: "+971 4 555 0303", email: "wholesale@emiratescoop.ae" },
  { name: "Jenan Farm Fresh", contact_name: "Maya Saeed", phone: "+971 4 555 0404", email: "orders@jenanfarm.ae" },
  { name: "Premium Packaging UAE", contact_name: "Tariq Khalil", phone: "+971 4 555 0505", email: "orders@premiumpack.ae" },
];

type IngredientSeed = {
  name: string;
  unit: "g" | "ml" | "ea";
  // Initial stock + threshold are in the base unit. Cost is fils per base unit.
  initialStock: number;
  reorderThreshold: number;
  costPerUnitFils: number;
  supplier: string;
};

const INGREDIENTS: IngredientSeed[] = [
  { name: "Belgian Dark Chocolate (Callebaut 70%)", unit: "g",  initialStock: 18000, reorderThreshold: 5000,  costPerUnitFils: 6,    supplier: "Belgian Chocolate Co. Dubai" },
  { name: "Belgian Milk Chocolate (Callebaut)",     unit: "g",  initialStock: 12000, reorderThreshold: 4000,  costPerUnitFils: 5.5,  supplier: "Belgian Chocolate Co. Dubai" },
  { name: "White Chocolate",                        unit: "g",  initialStock: 6000,  reorderThreshold: 2000,  costPerUnitFils: 5,    supplier: "Belgian Chocolate Co. Dubai" },
  { name: "Hazelnut Praline (Bueno-style)",         unit: "g",  initialStock: 3500,  reorderThreshold: 1200,  costPerUnitFils: 7,    supplier: "Belgian Chocolate Co. Dubai" },
  { name: "Pistachio Cream",                        unit: "g",  initialStock: 4000,  reorderThreshold: 1500,  costPerUnitFils: 20,   supplier: "Belgian Chocolate Co. Dubai" },
  { name: "Kunafa Shreds (Knafeh)",                 unit: "g",  initialStock: 5000,  reorderThreshold: 1500,  costPerUnitFils: 3,    supplier: "Emirates Co-op Wholesale" },
  { name: "Tahini",                                 unit: "g",  initialStock: 3000,  reorderThreshold: 1000,  costPerUnitFils: 3,    supplier: "Emirates Co-op Wholesale" },
  { name: "Lotus Biscoff Spread",                   unit: "g",  initialStock: 4000,  reorderThreshold: 1500,  costPerUnitFils: 8,    supplier: "Emirates Co-op Wholesale" },
  { name: "Mini Marshmallows",                      unit: "g",  initialStock: 2500,  reorderThreshold: 800,   costPerUnitFils: 3.5,  supplier: "Emirates Co-op Wholesale" },
  { name: "Puffed Rice Crispies",                   unit: "g",  initialStock: 3000,  reorderThreshold: 1000,  costPerUnitFils: 1.5,  supplier: "Emirates Co-op Wholesale" },
  { name: "All-Purpose Flour",                      unit: "g",  initialStock: 50000, reorderThreshold: 10000, costPerUnitFils: 0.5,  supplier: "Al Khaleej Sugar" },
  { name: "Almond Flour",                           unit: "g",  initialStock: 4000,  reorderThreshold: 1500,  costPerUnitFils: 6,    supplier: "Al Khaleej Sugar" },
  { name: "Cocoa Powder (Dutch)",                   unit: "g",  initialStock: 5000,  reorderThreshold: 1500,  costPerUnitFils: 5,    supplier: "Belgian Chocolate Co. Dubai" },
  { name: "Caster Sugar",                           unit: "g",  initialStock: 40000, reorderThreshold: 8000,  costPerUnitFils: 0.4,  supplier: "Al Khaleej Sugar" },
  { name: "Unsalted Butter",                        unit: "g",  initialStock: 20000, reorderThreshold: 5000,  costPerUnitFils: 3,    supplier: "Jenan Farm Fresh" },
  { name: "Heavy Cream",                            unit: "ml", initialStock: 8000,  reorderThreshold: 2000,  costPerUnitFils: 0.025, supplier: "Jenan Farm Fresh" },
  { name: "Eggs (Large)",                           unit: "ea", initialStock: 300,   reorderThreshold: 80,    costPerUnitFils: 150,  supplier: "Jenan Farm Fresh" },
  { name: "Vanilla Extract",                        unit: "ml", initialStock: 1500,  reorderThreshold: 400,   costPerUnitFils: 1.5,  supplier: "Al Khaleej Sugar" },
  { name: "Walnut Halves",                          unit: "g",  initialStock: 3000,  reorderThreshold: 1000,  costPerUnitFils: 8,    supplier: "Emirates Co-op Wholesale" },
  { name: "Sea Salt Flakes",                        unit: "g",  initialStock: 800,   reorderThreshold: 200,   costPerUnitFils: 2,    supplier: "Al Khaleej Sugar" },
  { name: "Branded Gift Box (Medium)",              unit: "ea", initialStock: 250,   reorderThreshold: 80,    costPerUnitFils: 500,  supplier: "Premium Packaging UAE" },
  { name: "Satin Ribbon (Branded)",                 unit: "ea", initialStock: 400,   reorderThreshold: 120,   costPerUnitFils: 100,  supplier: "Premium Packaging UAE" },
];

type ProductSeed = {
  name: string;
  category: string;
  priceFils: number;
  description: string;
  recipe: { ingredient: string; quantity: number }[];
};

// Catalog mirrors the live crazy-brownies.com store (recon 2026-05-09).
// Names and prices are taken verbatim. Recipes are realistic production amounts.
//
// Single-piece base recipe (per regular brownie, ~50g finished):
//   Belgian dark chocolate 50g, butter 30g, sugar 60g, 1 egg, flour 25g, cocoa 10g
// A "mini" brownie is ~half that. A "slab" is ~24 servings.

const BASE_BROWNIE = (n: number) => [
  { ingredient: "Belgian Dark Chocolate (Callebaut 70%)", quantity: 50 * n },
  { ingredient: "Unsalted Butter",                        quantity: 30 * n },
  { ingredient: "Caster Sugar",                           quantity: 60 * n },
  { ingredient: "Eggs (Large)",                           quantity: Math.max(1, Math.round(n)) },
  { ingredient: "All-Purpose Flour",                      quantity: 25 * n },
  { ingredient: "Cocoa Powder (Dutch)",                   quantity: 10 * n },
];
// half-size mini
const MINI_BROWNIE = (n: number) => BASE_BROWNIE(n * 0.5);

const PRODUCTS: ProductSeed[] = [
  // ── Crazy Brownies (boxes & slabs) ───────────────────────────────────────
  {
    name: "6-Pack Box",
    category: "Crazy Brownies",
    priceFils: 9900,
    description: "Six classic brownies — choose your flavors. Branded gift box.",
    recipe: [
      ...BASE_BROWNIE(6),
      { ingredient: "Lotus Biscoff Spread",       quantity: 30 },
      { ingredient: "Walnut Halves",              quantity: 30 },
      { ingredient: "Branded Gift Box (Medium)",  quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",     quantity: 1 },
    ],
  },
  {
    name: "12-Pack Box",
    category: "Crazy Brownies",
    priceFils: 16000,
    description: "Twelve mini brownies — choose 12 flavors. Most-popular gift size.",
    recipe: [
      ...MINI_BROWNIE(12),
      { ingredient: "Lotus Biscoff Spread",       quantity: 50 },
      { ingredient: "Walnut Halves",              quantity: 40 },
      { ingredient: "Branded Gift Box (Medium)",  quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",     quantity: 1 },
    ],
  },
  {
    name: "Make Your Own Mini Brownie Box (Medium)",
    category: "Crazy Brownies",
    priceFils: 12000,
    description: "Twelve mini brownies, fully customized flavors and message.",
    recipe: [
      ...MINI_BROWNIE(12),
      { ingredient: "Pistachio Cream",            quantity: 30 },
      { ingredient: "Lotus Biscoff Spread",       quantity: 30 },
      { ingredient: "Branded Gift Box (Medium)",  quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",     quantity: 1 },
    ],
  },
  {
    name: "Make Your Own Mini Brownie Box (Large)",
    category: "Crazy Brownies",
    priceFils: 19500,
    description: "Twenty-four mini brownies, customized — perfect for sharing.",
    recipe: [
      ...MINI_BROWNIE(24),
      { ingredient: "Pistachio Cream",            quantity: 60 },
      { ingredient: "Lotus Biscoff Spread",       quantity: 60 },
      { ingredient: "Walnut Halves",              quantity: 50 },
      { ingredient: "Branded Gift Box (Medium)",  quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",     quantity: 1 },
    ],
  },
  {
    name: "24 Corporate Mini Brownies",
    category: "Crazy Brownies",
    priceFils: 19900,
    description: "Branded corporate gift — 24 minis with company message.",
    recipe: [
      ...MINI_BROWNIE(24),
      { ingredient: "Branded Gift Box (Medium)",  quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",     quantity: 2 },
    ],
  },
  {
    name: "Happy Birthday Brownie Slab",
    category: "Crazy Brownies",
    priceFils: 16500,
    description: "Celebration slab with hand-piped birthday message in Belgian chocolate.",
    recipe: [
      ...BASE_BROWNIE(20),
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 150 },
      { ingredient: "Heavy Cream",                        quantity: 100 },
      { ingredient: "Vanilla Extract",                    quantity: 5 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Customize Your Own Brownie Slab",
    category: "Crazy Brownies",
    priceFils: 17500,
    description: "Fully custom slab — flavor, colors, and personalized message.",
    recipe: [
      ...BASE_BROWNIE(22),
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 200 },
      { ingredient: "White Chocolate",                    quantity: 80 },
      { ingredient: "Heavy Cream",                        quantity: 120 },
      { ingredient: "Vanilla Extract",                    quantity: 6 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Party Brownie Slab (Uncut)",
    category: "Crazy Brownies",
    priceFils: 14500,
    description: "Large party-sized slab, uncut — serves a crowd.",
    recipe: [
      ...BASE_BROWNIE(28),
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 100 },
      { ingredient: "Sea Salt Flakes",                    quantity: 5 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
    ],
  },

  // ── Crazy Bars (uniform 59 AED) ──────────────────────────────────────────
  {
    name: "Viral Pistachio Kunafa Bar (Milk)",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "Bestseller. Belgian milk chocolate, pistachio cream, crispy kunafa.",
    recipe: [
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 80 },
      { ingredient: "Pistachio Cream",                    quantity: 35 },
      { ingredient: "Kunafa Shreds (Knafeh)",             quantity: 25 },
      { ingredient: "Unsalted Butter",                    quantity: 12 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Viral Pistachio Kunafa Bar (Dark)",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "Same crunch and creamy pistachio, with intense Belgian dark chocolate.",
    recipe: [
      { ingredient: "Belgian Dark Chocolate (Callebaut 70%)", quantity: 80 },
      { ingredient: "Pistachio Cream",                        quantity: 35 },
      { ingredient: "Kunafa Shreds (Knafeh)",                 quantity: 25 },
      { ingredient: "Unsalted Butter",                        quantity: 12 },
      { ingredient: "Branded Gift Box (Medium)",              quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",                 quantity: 1 },
    ],
  },
  {
    name: "Bueno Bar",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "Bestseller. Belgian milk chocolate filled with creamy hazelnut praline.",
    recipe: [
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 90 },
      { ingredient: "Hazelnut Praline (Bueno-style)",     quantity: 35 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Bueno Kunefe Bar",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "The Bueno bar with crispy kunafa shreds folded through.",
    recipe: [
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 80 },
      { ingredient: "Hazelnut Praline (Bueno-style)",     quantity: 25 },
      { ingredient: "Kunafa Shreds (Knafeh)",             quantity: 20 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Baklava Bar",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "Belgian dark chocolate with pistachio, walnuts, and kunafa.",
    recipe: [
      { ingredient: "Belgian Dark Chocolate (Callebaut 70%)", quantity: 80 },
      { ingredient: "Pistachio Cream",                        quantity: 20 },
      { ingredient: "Walnut Halves",                          quantity: 25 },
      { ingredient: "Kunafa Shreds (Knafeh)",                 quantity: 20 },
      { ingredient: "Branded Gift Box (Medium)",              quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",                 quantity: 1 },
    ],
  },
  {
    name: "Salted Lotus Kunefe Bar",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "New. Lotus Biscoff and crispy kunafa with a flaky-salt finish.",
    recipe: [
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 80 },
      { ingredient: "Lotus Biscoff Spread",               quantity: 30 },
      { ingredient: "Kunafa Shreds (Knafeh)",             quantity: 20 },
      { ingredient: "Sea Salt Flakes",                    quantity: 1 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
  {
    name: "Marshmallow Crunch Bar",
    category: "Crazy Bars",
    priceFils: 5900,
    description: "Belgian milk chocolate with mini marshmallows and rice crispies.",
    recipe: [
      { ingredient: "Belgian Milk Chocolate (Callebaut)", quantity: 90 },
      { ingredient: "Mini Marshmallows",                  quantity: 25 },
      { ingredient: "Puffed Rice Crispies",               quantity: 20 },
      { ingredient: "Branded Gift Box (Medium)",          quantity: 1 },
      { ingredient: "Satin Ribbon (Branded)",             quantity: 1 },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted<T>(items: { item: T; weight: number }[]): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1].item;
}

function isWeekend(d: Date) {
  // UAE weekend = Friday + Saturday
  const day = d.getDay(); // 0=Sun ... 6=Sat
  return day === 5 || day === 6;
}

// ─── Seed run ────────────────────────────────────────────────────────────────

async function main() {
  console.log("seeding…");

  // Wipe in dependency order
  await db.execute(sql`truncate table
    stock_movements, order_items, orders, recipes, products, ingredients, suppliers
    restart identity cascade`);

  // Suppliers
  const supplierRows = await db
    .insert(schema.suppliers)
    .values(
      SUPPLIERS.map((s) => ({
        name: s.name,
        contactName: s.contact_name,
        phone: s.phone,
        email: s.email,
      })),
    )
    .returning();
  const supplierIdByName = new Map(supplierRows.map((s) => [s.name, s.id]));
  console.log(`  suppliers: ${supplierRows.length}`);

  // Ingredients (current_stock starts at 0 — set via restock movements below)
  const ingredientRows = await db
    .insert(schema.ingredients)
    .values(
      INGREDIENTS.map((i) => ({
        name: i.name,
        unit: i.unit,
        currentStock: "0",
        reorderThreshold: i.reorderThreshold.toString(),
        costPerUnitFils: i.costPerUnitFils.toString(),
        supplierId: supplierIdByName.get(i.supplier)!,
      })),
    )
    .returning();
  const ingredientIdByName = new Map(ingredientRows.map((i) => [i.name, i.id]));
  console.log(`  ingredients: ${ingredientRows.length}`);

  // Products. SKU is generated deterministically from category + name and a
  // random suffix, mirroring the migration's md5-based backfill so re-seeding
  // produces unique SKUs for near-duplicate names like "Pistachio (Milk)" /
  // "(Dark)". Freshness/default batch size are filled by 004_phase3_production.sql.
  const skuFor = (category: string, name: string) => {
    const cat = category.replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 2);
    const slug = name.replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 8);
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${cat}-${slug}-${suffix}`;
  };
  const productRows = await db
    .insert(schema.products)
    .values(
      PRODUCTS.map((p) => ({
        name: p.name,
        sku: skuFor(p.category, p.name),
        category: p.category,
        priceFils: p.priceFils,
        description: p.description,
      })),
    )
    .returning();
  const productByName = new Map(productRows.map((p) => [p.name, p]));
  console.log(`  products: ${productRows.length}`);

  // Recipes
  const recipeRows = PRODUCTS.flatMap((p) =>
    p.recipe.map((r) => ({
      productId: productByName.get(p.name)!.id,
      ingredientId: ingredientIdByName.get(r.ingredient)!,
      quantityPerUnit: r.quantity.toString(),
    })),
  );
  await db.insert(schema.recipes).values(recipeRows);
  console.log(`  recipes: ${recipeRows.length}`);

  // Initial restock + weekly top-ups will be inserted AFTER we know total demand,
  // so we can size them to leave a demo-friendly mix of statuses at "today".

  // Order generation — 30 days, with weekend bumps and a trending product.
  // Demand weights are rough relative volumes per product.
  const baseWeights: Record<string, number> = {
    // Crazy Brownies
    "6-Pack Box": 14,
    "12-Pack Box": 9,
    "Make Your Own Mini Brownie Box (Medium)": 8,
    "Make Your Own Mini Brownie Box (Large)": 5,
    "24 Corporate Mini Brownies": 1.5,
    "Happy Birthday Brownie Slab": 4,
    "Customize Your Own Brownie Slab": 2,
    "Party Brownie Slab (Uncut)": 1.2,
    // Crazy Bars (the viral product is the hero — and trends up over the 30 days)
    "Viral Pistachio Kunafa Bar (Milk)": 18,
    "Viral Pistachio Kunafa Bar (Dark)": 9,
    "Bueno Bar": 12,
    "Bueno Kunefe Bar": 6,
    "Baklava Bar": 5,
    "Salted Lotus Kunefe Bar": 6,    // tagged "New" — also trends up
    "Marshmallow Crunch Bar": 5,
  };

  // Real Crazy Brownies channels: physical store at Al Quoz + Wix website +
  // Deliveroo (Dubai 2-hr) + corporate orders. No Talabat / Careem.
  const channelDist = [
    { item: "in_store" as const,  weight: 5 },
    { item: "website" as const,   weight: 4 },
    { item: "deliveroo" as const, weight: 4 },
    { item: "corporate" as const, weight: 0.6 },
  ];

  const allOrders: { row: typeof schema.orders.$inferInsert; items: { productId: string; quantity: number; unitPriceFils: number }[] }[] = [];

  const today = new Date();
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const day = new Date(today);
    day.setDate(today.getDate() - dayOffset);
    day.setHours(0, 0, 0, 0);

    // Volume: 14–22 weekdays, 28–40 weekends. Trend: pistachio kunafa demand grows linearly.
    const weekendBoost = isWeekend(day) ? 1.9 : 1.0;
    const ordersToday = Math.round((rand(14, 22) * weekendBoost));

    // Linear trend factor for pistachio kunafa: 1.0 at day=29 → 1.7 at day=0
    const trendFactor = 1.0 + (29 - dayOffset) / 29 * 0.7;

    // Pistachio Kunafa (Milk) is the viral trending hero — demand grows ~70% over 30 days.
    // The Salted Lotus Kunefe Bar is tagged "New" and also trends up.
    const weights = Object.entries(baseWeights).map(([name, w]) => {
      let weight = w;
      if (name === "Viral Pistachio Kunafa Bar (Milk)") weight *= trendFactor;
      if (name === "Salted Lotus Kunefe Bar") weight *= 0.6 + (29 - dayOffset) / 29 * 0.6;
      return { item: name, weight };
    });

    for (let i = 0; i < ordersToday; i++) {
      const ts = new Date(day);
      ts.setHours(rand(9, 22), rand(0, 59), rand(0, 59));

      const itemCount = pickWeighted([
        { item: 1, weight: 6 },
        { item: 2, weight: 3 },
        { item: 3, weight: 1 },
      ]);

      const items: { productId: string; quantity: number; unitPriceFils: number }[] = [];
      const used = new Set<string>();
      for (let j = 0; j < itemCount; j++) {
        let pickName = pickWeighted(weights);
        let attempts = 0;
        while (used.has(pickName) && attempts++ < 4) pickName = pickWeighted(weights);
        used.add(pickName);
        const product = productByName.get(pickName)!;
        const qty = pickWeighted([
          { item: 1, weight: 7 },
          { item: 2, weight: 2 },
          { item: 4, weight: 0.5 },
          { item: 6, weight: 0.3 },
        ]);
        items.push({ productId: product.id, quantity: qty, unitPriceFils: product.priceFils });
      }

      const total = items.reduce((s, it) => s + it.quantity * it.unitPriceFils, 0);

      allOrders.push({
        row: {
          channel: pickWeighted(channelDist),
          totalFils: total,
          status: "fulfilled",
          createdAt: ts,
        },
        items,
      });
    }
  }

  console.log(`  generating ${allOrders.length} orders…`);

  // Insert orders in chunks
  const insertedOrders: { id: string; createdAt: Date }[] = [];
  for (let i = 0; i < allOrders.length; i += 100) {
    const chunk = allOrders.slice(i, i + 100);
    const inserted = await db
      .insert(schema.orders)
      .values(chunk.map((o) => o.row))
      .returning({ id: schema.orders.id, createdAt: schema.orders.createdAt });
    insertedOrders.push(...inserted);
  }

  // Order items + sale stock_movements
  const allOrderItems: (typeof schema.orderItems.$inferInsert)[] = [];
  const allSaleMovements: (typeof schema.stockMovements.$inferInsert)[] = [];

  // Pre-build a recipe lookup: productId -> [{ingredientId, quantity}]
  const recipeByProduct = new Map<string, { ingredientId: string; quantity: number }[]>();
  for (const p of PRODUCTS) {
    recipeByProduct.set(
      productByName.get(p.name)!.id,
      p.recipe.map((r) => ({
        ingredientId: ingredientIdByName.get(r.ingredient)!,
        quantity: r.quantity,
      })),
    );
  }

  for (let idx = 0; idx < allOrders.length; idx++) {
    const orderRow = insertedOrders[idx];
    const o = allOrders[idx];
    for (const item of o.items) {
      allOrderItems.push({
        orderId: orderRow.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceFils: item.unitPriceFils,
      });
      const recipe = recipeByProduct.get(item.productId)!;
      for (const r of recipe) {
        allSaleMovements.push({
          ingredientId: r.ingredientId,
          delta: (-r.quantity * item.quantity).toString(),
          reason: "sale",
          orderId: orderRow.id,
          createdAt: orderRow.createdAt,
        });
      }
    }
  }

  for (let i = 0; i < allOrderItems.length; i += 500) {
    await db.insert(schema.orderItems).values(allOrderItems.slice(i, i + 500));
  }
  console.log(`  order items: ${allOrderItems.length}`);

  for (let i = 0; i < allSaleMovements.length; i += 500) {
    await db.insert(schema.stockMovements).values(allSaleMovements.slice(i, i + 500));
  }
  console.log(`  sale movements: ${allSaleMovements.length}`);

  // ── Restocks ──────────────────────────────────────────────────────────────
  // Sum total 30-day demand per ingredient, then write:
  //   • An initial restock at day -35 sized to ~12 days of average demand.
  //   • A weekly top-up every 7 days for the first 3 weeks, sized for ~7 days each.
  //   • A small "trickle" of variance per ingredient so end-states aren't uniform.
  // The last week deliberately gets no restock — that's where our demoable
  // CRITICAL / LOW / OUT states come from.
  const demandByIngredient = new Map<string, number>();
  for (const m of allSaleMovements) {
    const id = m.ingredientId as string;
    const delta = Math.abs(Number(m.delta));
    demandByIngredient.set(id, (demandByIngredient.get(id) ?? 0) + delta);
  }

  const restockMovements: (typeof schema.stockMovements.$inferInsert)[] = [];
  const initialAt = new Date(today);
  initialAt.setDate(initialAt.getDate() - 35);
  initialAt.setHours(8, 0, 0, 0);

  for (const ing of INGREDIENTS) {
    const id = ingredientIdByName.get(ing.name)!;
    const totalDemand = demandByIngredient.get(id) ?? 0;
    if (totalDemand === 0) {
      // No demand at all — keep the originally-defined initial stock so it shows healthy.
      restockMovements.push({
        ingredientId: id,
        delta: ing.initialStock.toString(),
        reason: "restock",
        note: "Initial inventory load",
        createdAt: initialAt,
      });
      continue;
    }

    // Per-ingredient variance: some run hot (will end LOW/CRITICAL), some end HEALTHY.
    // 0.85 → ends well below threshold, 1.4 → ends comfortably above.
    const safetyFactor = 0.85 + Math.random() * 0.55;
    const totalToBring = totalDemand * safetyFactor + ing.reorderThreshold * 0.6;

    // Roughly: 40% upfront, 20% three weekly top-ups
    const initialQty = Math.round(totalToBring * 0.4);
    restockMovements.push({
      ingredientId: id,
      delta: initialQty.toString(),
      reason: "restock",
      note: "Opening inventory",
      createdAt: initialAt,
    });

    for (let w = 0; w < 3; w++) {
      const restockAt = new Date(today);
      restockAt.setDate(today.getDate() - (28 - w * 7));
      restockAt.setHours(rand(7, 10), rand(0, 59), 0, 0);
      const qty = Math.round(totalToBring * 0.2);
      restockMovements.push({
        ingredientId: id,
        delta: qty.toString(),
        reason: "restock",
        note: `Weekly restock from ${ing.supplier}`,
        createdAt: restockAt,
      });
    }
  }

  for (let i = 0; i < restockMovements.length; i += 500) {
    await db.insert(schema.stockMovements).values(restockMovements.slice(i, i + 500));
  }
  console.log(`  restock movements: ${restockMovements.length}`);

  // Add a couple of waste events so the AI has something to talk about
  const wasteAt = new Date(today);
  wasteAt.setDate(wasteAt.getDate() - 3);
  wasteAt.setHours(20, 30, 0, 0);
  await db.insert(schema.stockMovements).values([
    {
      ingredientId: ingredientIdByName.get("Heavy Cream")!,
      delta: "-200",
      reason: "waste",
      note: "Cream curdled in storage — discarded",
      createdAt: wasteAt,
    },
    {
      ingredientId: ingredientIdByName.get("Pistachio Cream")!,
      delta: "-150",
      reason: "waste",
      note: "Spillage during prep",
      createdAt: new Date(wasteAt.getTime() - 86400000),
    },
  ]);

  // Recompute current_stock from the ledger so it matches movements exactly
  await db.execute(sql`
    update ingredients i
    set current_stock = coalesce(m.total, 0)
    from (
      select ingredient_id, sum(delta)::numeric(12,3) as total
      from stock_movements group by ingredient_id
    ) m
    where m.ingredient_id = i.id
  `);

  console.log("done.");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
