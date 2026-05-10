import "server-only";
import { db } from "@/db/client";
import { products, recipes, orders, orderItems, stockMovements, ingredients } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";

type OrderChannel = "in_store" | "website" | "deliveroo" | "corporate";

const CHANNEL_WEIGHTS: { channel: OrderChannel; weight: number }[] = [
  { channel: "in_store",  weight: 0.35 },
  { channel: "deliveroo", weight: 0.30 },
  { channel: "website",   weight: 0.25 },
  { channel: "corporate", weight: 0.10 },
];

function weightedChannel(): OrderChannel {
  const r = Math.random();
  let acc = 0;
  for (const c of CHANNEL_WEIGHTS) {
    acc += c.weight;
    if (r <= acc) return c.channel;
  }
  return "in_store";
}

const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};

/**
 * Insert a synthetic order through the same write path as a real sale.
 * Used by the demo "live traffic" cron so the dashboard ticks visibly during
 * the screen recording. Disabled in production via SIMULATOR_OFF=true.
 */
export async function simulateOrder() {
  // Pull active products + their recipes once.
  const allProducts = await db
    .select({ id: products.id, name: products.name, priceFils: products.priceFils })
    .from(products)
    .where(eq(products.active, true));

  if (allProducts.length === 0) return { skipped: "no products" };

  // Bestsellers get extra weight: pistachio kunafa + bueno + hero brownies.
  const heroNames = [
    "Viral Pistachio Kunafa Bar",
    "Bueno Bar",
    "12-Pack Box",
    "6-Pack Box",
  ];
  const weighted = allProducts.flatMap((p) =>
    heroNames.some((h) => p.name.toLowerCase().includes(h.toLowerCase())) ? [p, p, p] : [p],
  );

  // 1–3 line items per order.
  const lineCount = 1 + Math.floor(Math.random() * 3);
  const picked = pickN(weighted, lineCount);
  // De-dup by product id (heroes can be picked twice through weighting).
  const linesByProduct = new Map<string, { productId: string; qty: number; priceFils: number }>();
  for (const p of picked) {
    const existing = linesByProduct.get(p.id);
    const qty = 1 + Math.floor(Math.random() * 2); // 1–2 units
    if (existing) {
      existing.qty += qty;
    } else {
      linesByProduct.set(p.id, { productId: p.id, qty, priceFils: p.priceFils });
    }
  }
  const lines = Array.from(linesByProduct.values());

  // Recipes for ingredient deduction.
  const recipeRows = await db
    .select({
      productId: recipes.productId,
      ingredientId: recipes.ingredientId,
      quantityPerUnit: recipes.quantityPerUnit,
    })
    .from(recipes)
    .where(inArray(recipes.productId, lines.map((l) => l.productId)));

  const ingredientDeltas = new Map<string, number>();
  for (const line of lines) {
    const lineRecipes = recipeRows.filter((r) => r.productId === line.productId);
    for (const r of lineRecipes) {
      const delta = -Number(r.quantityPerUnit) * line.qty;
      ingredientDeltas.set(r.ingredientId, (ingredientDeltas.get(r.ingredientId) ?? 0) + delta);
    }
  }

  const totalFils = lines.reduce((s, l) => s + l.priceFils * l.qty, 0);
  const channel = weightedChannel();

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        channel,
        totalFils,
        customerNote: null,
        status: "fulfilled",
        // createdBy null = system / simulator
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        quantity: l.qty,
        unitPriceFils: l.priceFils,
      })),
    );

    if (ingredientDeltas.size > 0) {
      await tx.insert(stockMovements).values(
        Array.from(ingredientDeltas.entries()).map(([ingredientId, delta]) => ({
          ingredientId,
          delta: delta.toString(),
          reason: "sale" as const,
          orderId: order.id,
          note: "Simulated order",
        })),
      );
      for (const [ingredientId, delta] of ingredientDeltas) {
        await tx
          .update(ingredients)
          .set({ currentStock: sql`${ingredients.currentStock} + ${delta.toString()}::numeric` })
          .where(eq(ingredients.id, ingredientId));
      }
    }
  });

  return { channel, lines: lines.length, totalFils };
}
