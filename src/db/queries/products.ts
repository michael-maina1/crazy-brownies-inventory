import "server-only";
import { db } from "@/db/client";
import { products, recipes, ingredients } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type ProductWithRecipe = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  priceFils: number;
  active: boolean;
  costFils: number;
  marginPct: number;
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
      category: products.category,
      description: products.description,
      priceFils: products.priceFils,
      active: products.active,
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

  const byProduct = new Map<string, ProductWithRecipe>();
  for (const r of rows) {
    let p = byProduct.get(r.productId);
    if (!p) {
      p = {
        id: r.productId,
        name: r.name,
        category: r.category,
        description: r.description,
        priceFils: r.priceFils,
        active: r.active,
        costFils: 0,
        marginPct: 0,
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
