"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { orders, orderItems, products } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { requireProfile } from "@/lib/auth";
import { allocateFromBatchesFIFO } from "@/lib/production";

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

  // Pull product prices for the line snapshot. Ingredients are NOT deducted
  // here — they were debited at bake time. Sales debit finished-good batches
  // FIFO instead (oldest expiry first). This is the bakery model: a brownie
  // not sold by closing is waste, never returns to raw ingredients.
  const productIds = parsed.data.lines.map((l) => l.productId);
  const productRows = await db.select().from(products).where(inArray(products.id, productIds));
  if (productRows.length !== new Set(productIds).size) {
    return { error: "One or more products were not found." };
  }
  const priceById = new Map(productRows.map((p) => [p.id, p.priceFils]));

  const totalFils = parsed.data.lines.reduce(
    (s, l) => s + (priceById.get(l.productId) ?? 0) * l.quantity,
    0,
  );

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

    for (const line of parsed.data.lines) {
      await allocateFromBatchesFIFO(tx, {
        productId: line.productId,
        qty: line.quantity,
        orderId: order.id,
        createdBy: profile.id,
      });
    }
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/production");
  revalidatePath("/products");
  return { ok: true as const };
}
