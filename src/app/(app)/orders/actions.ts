"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders, orderItems, products, recipes, stockMovements, ingredients } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireProfile } from "@/lib/auth";

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(50),
});

const recordSaleSchema = z.object({
  channel: z.enum(["in_store", "website", "deliveroo", "corporate"]),
  customerNote: z.string().max(200).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one product"),
});

export type RecordSaleInput = z.infer<typeof recordSaleSchema>;

export async function recordSale(input: RecordSaleInput) {
  const profile = await requireProfile();
  const parsed = recordSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Pull products (for current prices) + recipes (for ingredient deductions)
  const productIds = parsed.data.lines.map((l) => l.productId);
  const productRows = await db.select().from(products).where(inArray(products.id, productIds));
  if (productRows.length !== new Set(productIds).size) {
    return { error: "One or more products were not found." };
  }
  const priceById = new Map(productRows.map((p) => [p.id, p.priceFils]));

  const recipeRows = await db
    .select({
      productId: recipes.productId,
      ingredientId: recipes.ingredientId,
      quantityPerUnit: recipes.quantityPerUnit,
    })
    .from(recipes)
    .where(inArray(recipes.productId, productIds));

  // Aggregate ingredient deltas across all line items
  const ingredientDeltas = new Map<string, number>();
  for (const line of parsed.data.lines) {
    const lineRecipe = recipeRows.filter((r) => r.productId === line.productId);
    for (const r of lineRecipe) {
      const delta = -Number(r.quantityPerUnit) * line.quantity;
      ingredientDeltas.set(r.ingredientId, (ingredientDeltas.get(r.ingredientId) ?? 0) + delta);
    }
  }

  const totalFils = parsed.data.lines.reduce(
    (s, l) => s + (priceById.get(l.productId) ?? 0) * l.quantity,
    0,
  );

  // One transaction: order header + items + ingredient stock_movements + cached current_stock
  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        channel: parsed.data.channel,
        totalFils,
        customerNote: parsed.data.customerNote,
        status: "fulfilled",
        createdBy: profile.id,
      })
      .returning();

    await tx.insert(orderItems).values(
      parsed.data.lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPriceFils: priceById.get(l.productId) ?? 0,
      })),
    );

    if (ingredientDeltas.size > 0) {
      await tx.insert(stockMovements).values(
        Array.from(ingredientDeltas.entries()).map(([ingredientId, delta]) => ({
          ingredientId,
          delta: delta.toString(),
          reason: "sale" as const,
          orderId: order.id,
          createdBy: profile.id,
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

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { ok: true as const };
}
