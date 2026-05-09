import "server-only";
import { db } from "@/db/client";
import { orders, orderItems, ingredients, products, stockMovements } from "@/db/schema";
import { sql, desc, and, gte, lt, eq } from "drizzle-orm";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export async function getRevenueLast30Days() {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [row] = await db
    .select({
      revenueFils: sql<string>`coalesce(sum(${orders.totalFils}), 0)`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(gte(orders.createdAt, since));

  return {
    revenueFils: Number(row?.revenueFils ?? 0),
    orderCount: row?.orderCount ?? 0,
  };
}

export async function getOrdersToday() {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [row] = await db
    .select({
      revenueFils: sql<string>`coalesce(sum(${orders.totalFils}), 0)`,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, today), lt(orders.createdAt, tomorrow)));

  return {
    revenueFils: Number(row?.revenueFils ?? 0),
    orderCount: row?.orderCount ?? 0,
  };
}

export async function getLowStockSummary() {
  // OUT, CRITICAL (< 50% of threshold), LOW (< threshold)
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      reorderThreshold: ingredients.reorderThreshold,
    })
    .from(ingredients)
    .where(sql`${ingredients.currentStock} < ${ingredients.reorderThreshold}`)
    .orderBy(
      sql`(${ingredients.currentStock} / nullif(${ingredients.reorderThreshold}, 0)) asc`,
      ingredients.name,
    );

  return rows;
}

export async function getDailyRevenueSeries(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  // Build a date-series so days with zero orders still appear as zero.
  const rows = await db.execute<{ day: string; revenue_fils: string; order_count: number }>(sql`
    with days as (
      select generate_series(
        ${since.toISOString()}::date,
        current_date,
        interval '1 day'
      )::date as day
    )
    select
      d.day::text as day,
      coalesce(sum(o.total_fils), 0)::text as revenue_fils,
      count(o.id)::int as order_count
    from days d
    left join orders o on date_trunc('day', o.created_at)::date = d.day
    group by d.day
    order by d.day
  `);

  return rows.map((r) => ({
    day: r.day,
    revenueFils: Number(r.revenue_fils),
    orderCount: Number(r.order_count),
  }));
}

export async function getTopProducts(days = 30, limit = 5) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      category: products.category,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      revenueFils: sql<string>`sum(${orderItems.quantity} * ${orderItems.unitPriceFils})::bigint`,
    })
    .from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(gte(orders.createdAt, since))
    .groupBy(products.id, products.name, products.category)
    .orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.unitPriceFils})`))
    .limit(limit);

  return rows.map((r) => ({ ...r, revenueFils: Number(r.revenueFils) }));
}

export async function getRecentOrders(limit = 8) {
  const rows = await db.execute<{
    id: string;
    channel: string;
    total_fils: number;
    created_at: string;
    items: number;
    first_product: string;
  }>(sql`
    select
      o.id,
      o.channel::text as channel,
      o.total_fils,
      o.created_at::text as created_at,
      count(oi.id)::int as items,
      (select p.name from order_items oi2
        join products p on p.id = oi2.product_id
        where oi2.order_id = o.id
        order by oi2.id asc limit 1) as first_product
    from orders o
    left join order_items oi on oi.order_id = o.id
    group by o.id
    order by o.created_at desc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id as string,
    channel: r.channel as string,
    totalFils: Number(r.total_fils),
    createdAt: new Date(r.created_at),
    items: Number(r.items),
    firstProduct: r.first_product as string,
  }));
}

export async function getWastePercent(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${stockMovements.reason} = 'sale' then abs(${stockMovements.delta}) else 0 end), 0)`,
      waste: sql<string>`coalesce(sum(case when ${stockMovements.reason} = 'waste' then abs(${stockMovements.delta}) else 0 end), 0)`,
    })
    .from(stockMovements)
    .where(gte(stockMovements.createdAt, since));

  const total = Number(row?.total ?? 0);
  const waste = Number(row?.waste ?? 0);
  return total > 0 ? (waste / total) * 100 : 0;
}
