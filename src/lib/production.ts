import "server-only";
import { db } from "@/db/client";
import {
  products,
  productBatches,
  productBatchMovements,
  recipes,
  ingredients,
  stockMovements,
} from "@/db/schema";
import { eq, sql, like, and, gt, inArray } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Strip the category prefix off a SKU to keep batch codes shorter on the label.
 * "CR-VIRALPIS-F79" → "VIRALPIS-F79"
 */
function shortenSku(sku: string): string {
  const parts = sku.split("-");
  return parts.slice(1).join("-") || sku;
}

const ymd = (d: Date) => d.toISOString().slice(2, 10).replace(/-/g, "");

/**
 * Generate the next batch code for a product on a given calendar day:
 * "<sku-tail>-<YYMMDD>-<seq>". Sequence starts at 1 each day per product.
 */
export async function nextBatchCode(productId: string, bakedAt: Date): Promise<string> {
  const [p] = await db.select({ sku: products.sku }).from(products).where(eq(products.id, productId));
  if (!p) throw new Error(`Unknown product ${productId}`);
  const prefix = `${shortenSku(p.sku)}-${ymd(bakedAt)}`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productBatches)
    .where(like(productBatches.batchCode, `${prefix}-%`));
  const seq = (row?.count ?? 0) + 1;
  return `${prefix}-${seq}`;
}

/**
 * Compute the per-unit cost at "now" for a product, summing recipe lines
 * × current ingredient cost-per-unit. Returns the rounded fils per unit.
 */
async function computeUnitCostFils(productId: string): Promise<number> {
  const rows = await db
    .select({
      qty: recipes.quantityPerUnit,
      costPerUnit: ingredients.costPerUnitFils,
    })
    .from(recipes)
    .innerJoin(ingredients, eq(ingredients.id, recipes.ingredientId))
    .where(eq(recipes.productId, productId));
  return Math.round(
    rows.reduce((sum, r) => sum + Number(r.qty) * Number(r.costPerUnit), 0),
  );
}

export type StartBakeArgs = {
  productId: string;
  quantity: number;
  bakedBy?: string;
  forecastId?: string;
  note?: string;
};

/**
 * The single helper that creates a finished-good batch. In one transaction:
 * 1. Pre-compute batch_code + expires_at + per-unit cost snapshot.
 * 2. Insert the product_batches row with status='active' and quantity_remaining=quantity.
 * 3. For each recipe line, debit the ingredient via stock_movements + update
 *    `ingredients.current_stock`. Reason is 'adjustment' with note "Bake <code>"
 *    so the existing ledger reports stay clean — sale-time deduction wiring
 *    (Path A) is paid Phase-2-full work.
 * Returns the inserted batch.
 */
export async function startBake(args: StartBakeArgs) {
  if (!(args.quantity > 0)) throw new Error("Bake quantity must be positive");

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      freshnessHours: products.freshnessHours,
    })
    .from(products)
    .where(eq(products.id, args.productId));
  if (!product) throw new Error(`Unknown product ${args.productId}`);

  const bakedAt = new Date();
  const hours = product.freshnessHours ?? 168; // 7d safe default
  const expiresAt = new Date(bakedAt.getTime() + hours * 60 * 60 * 1000);
  const batchCode = await nextBatchCode(args.productId, bakedAt);
  const unitCost = await computeUnitCostFils(args.productId);

  const recipeRows = await db
    .select({
      ingredientId: recipes.ingredientId,
      quantityPerUnit: recipes.quantityPerUnit,
    })
    .from(recipes)
    .where(eq(recipes.productId, args.productId));

  const ingredientDeltas = recipeRows.map((r) => ({
    ingredientId: r.ingredientId,
    delta: -Number(r.quantityPerUnit) * args.quantity,
  }));

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(productBatches)
      .values({
        productId: args.productId,
        batchCode,
        bakedAt,
        expiresAt,
        quantityBaked: args.quantity,
        quantityRemaining: args.quantity,
        costAtBakeFils: unitCost * args.quantity,
        status: "active",
        forecastId: args.forecastId ?? null,
        bakedBy: args.bakedBy,
        note: args.note ?? null,
      })
      .returning();

    if (ingredientDeltas.length > 0) {
      await tx.insert(stockMovements).values(
        ingredientDeltas.map((d) => ({
          ingredientId: d.ingredientId,
          delta: d.delta.toString(),
          reason: "adjustment" as const,
          note: `Bake ${batchCode}`,
          createdBy: args.bakedBy,
        })),
      );

      for (const d of ingredientDeltas) {
        await tx
          .update(ingredients)
          .set({
            currentStock: sql`${ingredients.currentStock} + ${d.delta.toString()}::numeric`,
          })
          .where(eq(ingredients.id, d.ingredientId));
      }
    }

    return batch;
  });
}

/**
 * Allocate `qty` units of a product to fulfilment, FIFO across active batches
 * by oldest expiry first. Writes one product_batch_movements row per batch
 * touched, decrements quantity_remaining, and flips status to 'depleted' for
 * any batches that hit zero. Returns how much was actually allocated vs how
 * much went unfulfilled (for products with no active batches yet).
 *
 * Designed to run inside a caller's transaction so the order header + items
 * + batch movements all commit together.
 */
export async function allocateFromBatchesFIFO(
  tx: Tx,
  args: {
    productId: string;
    qty: number;
    orderId?: string;
    createdBy?: string;
  },
): Promise<{ allocated: number; unfulfilled: number }> {
  if (args.qty <= 0) return { allocated: 0, unfulfilled: 0 };

  const batches = await tx
    .select({
      id: productBatches.id,
      quantityRemaining: productBatches.quantityRemaining,
      expiresAt: productBatches.expiresAt,
    })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.productId, args.productId),
        eq(productBatches.status, "active"),
        gt(productBatches.quantityRemaining, 0),
      ),
    )
    .orderBy(productBatches.expiresAt);

  let remaining = args.qty;
  const allocations: { batchId: string; qty: number }[] = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.quantityRemaining);
    if (take <= 0) continue;
    allocations.push({ batchId: b.id, qty: take });
    remaining -= take;
  }

  for (const a of allocations) {
    await tx.insert(productBatchMovements).values({
      productBatchId: a.batchId,
      delta: -a.qty,
      reason: "sale",
      orderId: args.orderId,
      createdBy: args.createdBy,
    });
    await tx
      .update(productBatches)
      .set({
        quantityRemaining: sql`${productBatches.quantityRemaining} - ${a.qty}`,
      })
      .where(eq(productBatches.id, a.batchId));
  }

  // Single follow-up update flips any batch that hit zero into 'depleted'.
  if (allocations.length > 0) {
    await tx
      .update(productBatches)
      .set({ status: "depleted" })
      .where(
        and(
          inArray(
            productBatches.id,
            allocations.map((a) => a.batchId),
          ),
          eq(productBatches.quantityRemaining, 0),
        ),
      );
  }

  return { allocated: args.qty - remaining, unfulfilled: remaining };
}

/**
 * Record a non-sale movement against a finished-good batch (waste, transfer,
 * adjustment, expire). Atomically: write the ledger row, decrement
 * quantity_remaining, and flip status if appropriate.
 */
export async function recordProductBatchMovement(args: {
  productBatchId: string;
  delta: number;
  reason: "waste" | "adjustment" | "expire" | "transfer";
  note?: string;
  createdBy?: string;
}) {
  return db.transaction(async (tx) => {
    await tx.insert(productBatchMovements).values({
      productBatchId: args.productBatchId,
      delta: args.delta,
      reason: args.reason,
      note: args.note,
      createdBy: args.createdBy,
    });
    await tx
      .update(productBatches)
      .set({
        quantityRemaining: sql`${productBatches.quantityRemaining} + ${args.delta}`,
      })
      .where(eq(productBatches.id, args.productBatchId));

    // For waste/expire we also flip the parent status.
    if (args.reason === "waste" || args.reason === "expire") {
      const target = args.reason === "expire" ? "expired" : "discarded";
      await tx
        .update(productBatches)
        .set({ status: target })
        .where(
          and(
            eq(productBatches.id, args.productBatchId),
            eq(productBatches.quantityRemaining, 0),
          ),
        );
    }
  });
}
