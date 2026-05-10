import "server-only";
import { db } from "@/db/client";
import { productBatches, products } from "@/db/schema";
import { eq, sql, desc, and, gt } from "drizzle-orm";

export type ReadyStockRow = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  freshnessHours: number | null;
  unitsRemaining: number;
  batchCount: number;
  earliestExpiresAt: Date | null;
};

/**
 * Per-product summary of finished goods ready to sell. Drives the "Ready: X
 * units / Y batches · best by Z" subtitle on the Products tab.
 */
export async function getProductReadyStock(): Promise<ReadyStockRow[]> {
  const rows = await db.execute<{
    product_id: string;
    name: string;
    sku: string;
    category: string;
    freshness_hours: number | null;
    units_remaining: string;
    batch_count: number;
    earliest_expires_at: string | null;
  }>(sql`
    select p.id::text as product_id,
           p.name,
           p.sku,
           p.category,
           p.freshness_hours,
           coalesce(sum(pb.quantity_remaining), 0)::text as units_remaining,
           count(pb.id)::int as batch_count,
           min(pb.expires_at)::text as earliest_expires_at
    from products p
    left join product_batches pb
      on pb.product_id = p.id
     and pb.status = 'active'
     and pb.quantity_remaining > 0
    where p.active = true
    group by p.id, p.name, p.sku, p.category, p.freshness_hours
    order by p.category, p.name
  `);

  return rows.map((r) => ({
    productId: r.product_id,
    productName: r.name,
    sku: r.sku,
    category: r.category,
    freshnessHours: r.freshness_hours,
    unitsRemaining: Number(r.units_remaining),
    batchCount: r.batch_count,
    earliestExpiresAt: r.earliest_expires_at ? new Date(r.earliest_expires_at) : null,
  }));
}

export type ActiveBatchRow = {
  id: string;
  batchCode: string;
  productId: string;
  productName: string;
  category: string;
  bakedAt: Date;
  expiresAt: Date;
  quantityRemaining: number;
  quantityBaked: number;
  costAtBakeFils: number;
  status: string;
  hoursToExpiry: number;
};

/**
 * Live list of all active product_batches with quantity_remaining > 0. The
 * production board reads this for the "On the shelf" column.
 */
export async function getActiveBatches(limit = 100): Promise<ActiveBatchRow[]> {
  const rows = await db
    .select({
      id: productBatches.id,
      batchCode: productBatches.batchCode,
      productId: productBatches.productId,
      productName: products.name,
      category: products.category,
      bakedAt: productBatches.bakedAt,
      expiresAt: productBatches.expiresAt,
      quantityRemaining: productBatches.quantityRemaining,
      quantityBaked: productBatches.quantityBaked,
      costAtBakeFils: productBatches.costAtBakeFils,
      status: productBatches.status,
    })
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .where(and(eq(productBatches.status, "active"), gt(productBatches.quantityRemaining, 0)))
    .orderBy(productBatches.expiresAt)
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    hoursToExpiry: Math.max(
      0,
      Math.round((r.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)),
    ),
  }));
}

export type TodayBakeRow = {
  id: string;
  batchCode: string;
  productName: string;
  category: string;
  bakedAt: Date;
  quantityBaked: number;
  quantityRemaining: number;
};

/**
 * Bakes started today (all statuses). Drives the "Baked today" column on the
 * production page so staff can see what's already in the oven / on the shelf.
 */
export async function getTodaysBakes(): Promise<TodayBakeRow[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      id: productBatches.id,
      batchCode: productBatches.batchCode,
      productName: products.name,
      category: products.category,
      bakedAt: productBatches.bakedAt,
      quantityBaked: productBatches.quantityBaked,
      quantityRemaining: productBatches.quantityRemaining,
    })
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .where(sql`${productBatches.bakedAt} >= ${startOfDay.toISOString()}::timestamptz`)
    .orderBy(desc(productBatches.bakedAt))
    .limit(50);

  return rows;
}

/**
 * Read-only batch fetch with product info for the print-label page and
 * server-side QR encoding.
 */
export async function getBatchForLabel(id: string) {
  const [row] = await db
    .select({
      id: productBatches.id,
      batchCode: productBatches.batchCode,
      productName: products.name,
      category: products.category,
      sku: products.sku,
      bakedAt: productBatches.bakedAt,
      expiresAt: productBatches.expiresAt,
      quantityBaked: productBatches.quantityBaked,
    })
    .from(productBatches)
    .innerJoin(products, eq(products.id, productBatches.productId))
    .where(eq(productBatches.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Public batch lookup via the SECURITY DEFINER function. Exposes only the
 * customer-safe fields and is the ONLY public read path on product_batches.
 */
export async function getPublicBatch(id: string) {
  const rows = await db.execute<{
    product_name: string;
    category: string;
    batch_code: string;
    baked_at: string;
    expires_at: string;
    status: string;
  }>(sql`select * from public.get_public_batch(${id}::uuid)`);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    productName: r.product_name,
    category: r.category,
    batchCode: r.batch_code,
    bakedAt: new Date(r.baked_at),
    expiresAt: new Date(r.expires_at),
    status: r.status,
  };
}
