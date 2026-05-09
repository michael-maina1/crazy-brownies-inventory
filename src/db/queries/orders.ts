import "server-only";
import { db } from "@/db/client";
import { orders, orderItems, products } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function getOrders(limit = 50) {
  const rows = await db.execute<{
    id: string;
    channel: string;
    total_fils: number;
    customer_note: string | null;
    status: string;
    created_at: string;
    items: number;
    products: string;
  }>(sql`
    select
      o.id,
      o.channel::text as channel,
      o.total_fils,
      o.customer_note,
      o.status::text as status,
      o.created_at::text as created_at,
      count(oi.id)::int as items,
      string_agg(p.name, ', ' order by oi.id) as products
    from orders o
    left join order_items oi on oi.order_id = o.id
    left join products p on p.id = oi.product_id
    group by o.id
    order by o.created_at desc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    totalFils: Number(r.total_fils),
    customerNote: r.customer_note,
    status: r.status,
    createdAt: new Date(r.created_at),
    items: Number(r.items),
    productsLabel: r.products ?? "",
  }));
}

export async function getActiveProducts() {
  return db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      priceFils: products.priceFils,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.category, products.name);
}
