import "server-only";
import { db } from "@/db/client";
import { ingredients, stockMovements } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type MovementReason = "sale" | "restock" | "waste" | "adjustment" | "recount";

/**
 * The single helper that any inventory mutation must go through. Writes a row
 * to `stock_movements` and adjusts `ingredients.current_stock` in the same
 * transaction so the ledger and the cached current_stock stay in lockstep.
 *
 * `delta` is in the ingredient's base unit. Positive = addition (restock),
 * negative = deduction (sale, waste).
 */
export async function recordStockMovement(args: {
  ingredientId: string;
  delta: number;
  reason: MovementReason;
  orderId?: string;
  note?: string;
  createdBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        ingredientId: args.ingredientId,
        delta: args.delta.toString(),
        reason: args.reason,
        orderId: args.orderId,
        note: args.note,
        createdBy: args.createdBy,
      })
      .returning();

    await tx
      .update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} + ${args.delta.toString()}::numeric`,
      })
      .where(eq(ingredients.id, args.ingredientId));

    return movement;
  });
}
