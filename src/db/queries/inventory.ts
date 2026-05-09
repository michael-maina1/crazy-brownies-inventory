import "server-only";
import { db } from "@/db/client";
import { ingredients, suppliers, stockMovements } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function getIngredientsWithSuppliers() {
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      reorderThreshold: ingredients.reorderThreshold,
      costPerUnitFils: ingredients.costPerUnitFils,
      supplierId: ingredients.supplierId,
      supplierName: suppliers.name,
    })
    .from(ingredients)
    .leftJoin(suppliers, eq(suppliers.id, ingredients.supplierId))
    .orderBy(
      sql`(${ingredients.currentStock} / nullif(${ingredients.reorderThreshold}, 0)) asc nulls last`,
      ingredients.name,
    );
  return rows;
}

export async function getStockMovementsForIngredient(ingredientId: string, limit = 20) {
  const rows = await db
    .select({
      id: stockMovements.id,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      orderId: stockMovements.orderId,
    })
    .from(stockMovements)
    .where(eq(stockMovements.ingredientId, ingredientId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
  return rows;
}
