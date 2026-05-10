import "server-only";
import { db } from "@/db/client";
import { ingredients, stockMovements, ingredientBatches } from "@/db/schema";
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
  batchId?: string;
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
        batchId: args.batchId,
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

/**
 * Receive a supplier delivery. Creates a batch row, increments
 * `ingredients.current_stock`, and writes the matching restock movement —
 * all in one transaction. The batch is the audit-quality artefact (where the
 * stock came from, when, what it cost, when it expires).
 */
export async function receiveDelivery(args: {
  ingredientId: string;
  supplierId?: string | null;
  batchCode?: string | null;
  quantity: number; // base unit, must be positive
  costFils: number; // total batch cost in fils
  receivedAt?: Date;
  expiresAt?: Date | null;
  note?: string | null;
  createdBy?: string;
}) {
  if (!(args.quantity > 0)) throw new Error("Receive quantity must be positive");

  // Per-base-unit cost for this delivery. Pushed back onto the ingredient row
  // so the next bake's cost_at_bake_fils snapshot uses the latest invoice
  // price. Phase 2 upgrade is a weighted-average across active batches; for
  // now "latest delivery wins" matches how a small bakery actually thinks
  // about cost ("we last paid X for it").
  const perUnitCostFils = args.costFils > 0 ? args.costFils / args.quantity : 0;

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(ingredientBatches)
      .values({
        ingredientId: args.ingredientId,
        supplierId: args.supplierId ?? null,
        batchCode: args.batchCode ?? null,
        receivedAt: args.receivedAt ?? new Date(),
        expiresAt: args.expiresAt ?? null,
        quantityReceived: args.quantity.toString(),
        quantityRemaining: args.quantity.toString(),
        costFils: args.costFils.toString(),
        note: args.note ?? null,
        createdBy: args.createdBy,
      })
      .returning();

    await tx.insert(stockMovements).values({
      ingredientId: args.ingredientId,
      delta: args.quantity.toString(),
      reason: "restock",
      batchId: batch.id,
      note: args.batchCode ? `Batch ${args.batchCode}` : null,
      createdBy: args.createdBy,
    });

    await tx
      .update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} + ${args.quantity.toString()}::numeric`,
        // Only overwrite when the operator entered a non-zero cost. Receiving
        // a sample / unpriced delivery shouldn't zero out the per-unit cost.
        ...(perUnitCostFils > 0 ? { costPerUnitFils: perUnitCostFils.toFixed(4) } : {}),
      })
      .where(eq(ingredients.id, args.ingredientId));

    return batch;
  });
}
