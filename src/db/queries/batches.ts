import "server-only";
import { db } from "@/db/client";
import { ingredientBatches, ingredients, suppliers } from "@/db/schema";
import { eq, sql, gt, isNotNull, and } from "drizzle-orm";

export type BatchFreshness = "expired" | "expiring_soon" | "aging" | "fresh" | "unknown";

const EXPIRING_SOON_DAYS = 7;

/**
 * Compute a freshness state from days-until-expiry plus the ingredient's full
 * shelf life. Used everywhere that needs a colour: dashboard KPI, batch list,
 * AI tool responses.
 */
export function freshnessOf(
  expiresAt: Date | null,
  shelfLifeDays: number | null,
): BatchFreshness {
  if (!expiresAt) return "unknown";
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const daysLeft = ms / (1000 * 60 * 60 * 24);
  if (daysLeft <= EXPIRING_SOON_DAYS) return "expiring_soon";
  if (shelfLifeDays && daysLeft <= shelfLifeDays * 0.4) return "aging";
  return "fresh";
}

export async function getExpiringSoonSummary(daysAhead = EXPIRING_SOON_DAYS) {
  const rows = await db.execute<{
    batches: number;
    aed_at_risk_fils: string;
    expired_count: number;
  }>(sql`
    select
      count(*)::int as batches,
      coalesce(sum(
        case when b.quantity_received > 0
             then b.cost_fils * (b.quantity_remaining / nullif(b.quantity_received, 0))
             else 0 end
      ), 0)::text as aed_at_risk_fils,
      sum(case when b.expires_at < now() then 1 else 0 end)::int as expired_count
    from ingredient_batches b
    where b.quantity_remaining > 0
      and b.expires_at is not null
      and b.expires_at <= now() + (${daysAhead}::int * interval '1 day')
  `);
  const r = rows[0];
  return {
    batches: Number(r?.batches ?? 0),
    expiredCount: Number(r?.expired_count ?? 0),
    aedAtRiskFils: Number(r?.aed_at_risk_fils ?? 0),
    daysAhead,
  };
}

export async function getExpiringSoonBatches(daysAhead = EXPIRING_SOON_DAYS, limit = 50) {
  const rows = await db
    .select({
      id: ingredientBatches.id,
      ingredientId: ingredientBatches.ingredientId,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      shelfLifeDays: ingredients.shelfLifeDays,
      supplierName: suppliers.name,
      batchCode: ingredientBatches.batchCode,
      receivedAt: ingredientBatches.receivedAt,
      expiresAt: ingredientBatches.expiresAt,
      quantityReceived: ingredientBatches.quantityReceived,
      quantityRemaining: ingredientBatches.quantityRemaining,
      costFils: ingredientBatches.costFils,
    })
    .from(ingredientBatches)
    .innerJoin(ingredients, eq(ingredients.id, ingredientBatches.ingredientId))
    .leftJoin(suppliers, eq(suppliers.id, ingredientBatches.supplierId))
    .where(
      and(
        gt(ingredientBatches.quantityRemaining, "0"),
        isNotNull(ingredientBatches.expiresAt),
        sql`${ingredientBatches.expiresAt} <= now() + (${daysAhead}::int * interval '1 day')`,
      ),
    )
    .orderBy(ingredientBatches.expiresAt)
    .limit(limit);

  return rows.map((r) => {
    const remaining = Number(r.quantityRemaining);
    const received = Number(r.quantityReceived);
    const totalCost = Number(r.costFils);
    const aedAtRiskFils = received > 0 ? Math.round((totalCost * remaining) / received) : 0;
    return {
      ...r,
      quantityRemaining: remaining,
      quantityReceived: received,
      costFils: totalCost,
      aedAtRiskFils,
      freshness: freshnessOf(r.expiresAt, r.shelfLifeDays),
    };
  });
}

export async function getBatchesForIngredient(ingredientId: string) {
  const rows = await db
    .select({
      id: ingredientBatches.id,
      batchCode: ingredientBatches.batchCode,
      receivedAt: ingredientBatches.receivedAt,
      expiresAt: ingredientBatches.expiresAt,
      quantityReceived: ingredientBatches.quantityReceived,
      quantityRemaining: ingredientBatches.quantityRemaining,
      costFils: ingredientBatches.costFils,
      supplierName: suppliers.name,
    })
    .from(ingredientBatches)
    .leftJoin(suppliers, eq(suppliers.id, ingredientBatches.supplierId))
    .where(eq(ingredientBatches.ingredientId, ingredientId))
    .orderBy(ingredientBatches.expiresAt);
  return rows;
}

export async function getReceiveFormData() {
  const [ings, sups] = await Promise.all([
    db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        unit: ingredients.unit,
        shelfLifeDays: ingredients.shelfLifeDays,
        supplierId: ingredients.supplierId,
        costPerUnitFils: ingredients.costPerUnitFils,
      })
      .from(ingredients)
      .orderBy(ingredients.name),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name),
  ]);
  return { ingredients: ings, suppliers: sups };
}
