import "server-only";
import { db } from "@/db/client";
import { products, recipes, ingredients, productBatches } from "@/db/schema";
import { eq, sql, and, gt } from "drizzle-orm";

export type ProductWithRecipe = {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string | null;
  priceFils: number;
  active: boolean;
  costFils: number;
  marginPct: number;
  freshnessHours: number | null;
  unitsRemaining: number;
  batchCount: number;
  earliestExpiresAt: Date | null;
  recipe: {
    ingredientId: string;
    ingredientName: string;
    unit: "g" | "ml" | "ea";
    quantityPerUnit: number;
    lineCostFils: number;
  }[];
};

export async function getProductsWithRecipes(): Promise<ProductWithRecipe[]> {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      description: products.description,
      priceFils: products.priceFils,
      active: products.active,
      freshnessHours: products.freshnessHours,
      ingredientId: ingredients.id,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      costPerUnitFils: ingredients.costPerUnitFils,
      quantityPerUnit: recipes.quantityPerUnit,
    })
    .from(products)
    .leftJoin(recipes, eq(recipes.productId, products.id))
    .leftJoin(ingredients, eq(ingredients.id, recipes.ingredientId))
    .orderBy(products.category, products.name);

  // Aggregate active product_batches per product for the ready-stock subtitle.
  const stockRows = await db
    .select({
      productId: productBatches.productId,
      units: sql<number>`coalesce(sum(${productBatches.quantityRemaining}), 0)::int`,
      batches: sql<number>`count(*)::int`,
      earliest: sql<string | null>`min(${productBatches.expiresAt})::text`,
    })
    .from(productBatches)
    .where(and(eq(productBatches.status, "active"), gt(productBatches.quantityRemaining, 0)))
    .groupBy(productBatches.productId);
  const stockByProduct = new Map(
    stockRows.map((r) => [
      r.productId,
      {
        unitsRemaining: r.units,
        batchCount: r.batches,
        earliestExpiresAt: r.earliest ? new Date(r.earliest) : null,
      },
    ]),
  );

  const byProduct = new Map<string, ProductWithRecipe>();
  for (const r of rows) {
    let p = byProduct.get(r.productId);
    if (!p) {
      const stock = stockByProduct.get(r.productId);
      p = {
        id: r.productId,
        name: r.name,
        sku: r.sku,
        category: r.category,
        description: r.description,
        priceFils: r.priceFils,
        active: r.active,
        costFils: 0,
        marginPct: 0,
        freshnessHours: r.freshnessHours,
        unitsRemaining: stock?.unitsRemaining ?? 0,
        batchCount: stock?.batchCount ?? 0,
        earliestExpiresAt: stock?.earliestExpiresAt ?? null,
        recipe: [],
      };
      byProduct.set(r.productId, p);
    }
    if (r.ingredientId) {
      const qty = Number(r.quantityPerUnit);
      const costPerUnit = Number(r.costPerUnitFils);
      const lineCostFils = Math.round(qty * costPerUnit);
      p.recipe.push({
        ingredientId: r.ingredientId,
        ingredientName: r.ingredientName ?? "",
        unit: r.unit ?? "g",
        quantityPerUnit: qty,
        lineCostFils,
      });
      p.costFils += lineCostFils;
    }
  }
  for (const p of byProduct.values()) {
    p.marginPct = p.priceFils > 0 ? ((p.priceFils - p.costFils) / p.priceFils) * 100 : 0;
  }
  return Array.from(byProduct.values());
}
