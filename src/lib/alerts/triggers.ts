import "server-only";
import { db } from "@/db/client";
import { ingredients, suppliers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dispatchAlert } from "./dispatch";
import { formatQuantity } from "@/lib/format";

/**
 * Called after a stock_movement is committed. If the ingredient is now below
 * its reorder threshold, dispatch a low-stock alert. Cheap enough to call
 * inside the same request — Resend is fire-and-forget HTTP and we dedupe
 * within `dispatchAlert`.
 */
export async function checkLowStockAlert(ingredientId: string) {
  const [row] = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      reorderThreshold: ingredients.reorderThreshold,
      supplier: suppliers.name,
    })
    .from(ingredients)
    .leftJoin(suppliers, eq(suppliers.id, ingredients.supplierId))
    .where(eq(ingredients.id, ingredientId))
    .limit(1);

  if (!row) return;
  const stock = Number(row.currentStock);
  const threshold = Number(row.reorderThreshold);
  if (stock >= threshold) return;
  if (threshold <= 0) return;

  const status =
    stock <= 0 ? "OUT" : stock < threshold * 0.5 ? "CRITICAL" : "LOW";
  const subject = `[Crazy Brownies] ${status}: ${row.name}`;
  const body = [
    `${row.name} is ${status.toLowerCase()}.`,
    `Current: ${formatQuantity(stock, row.unit)}`,
    `Reorder threshold: ${formatQuantity(threshold, row.unit)}`,
    row.supplier ? `Supplier: ${row.supplier}` : null,
    "",
    "Open Inventory in the Command Center to log a restock.",
  ]
    .filter(Boolean)
    .join("\n");

  await dispatchAlert({ event: "low_stock", subject, body });
}
