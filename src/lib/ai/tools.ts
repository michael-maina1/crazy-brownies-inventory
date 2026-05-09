import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db/client";
import {
  ingredients,
  products,
  orders,
  orderItems,
  recipes,
  stockMovements,
} from "@/db/schema";
import { sql, gte, eq, ilike, and, desc, inArray } from "drizzle-orm";

// ─── Tool schemas (sent to Claude) ───────────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_inventory_status",
    description:
      "Get current stock levels for all ingredients OR a specific ingredient by name (case-insensitive partial match). Returns name, unit, current stock, reorder threshold, status (out/critical/low/healthy), and supplier.",
    input_schema: {
      type: "object",
      properties: {
        name_filter: {
          type: "string",
          description: "Optional partial ingredient name (e.g. 'pistachio'). Omit to return all.",
        },
      },
    },
  },
  {
    name: "get_low_stock",
    description:
      "List every ingredient currently below its reorder threshold, sorted by urgency. Each item includes how many days of stock remain at the recent average burn rate.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_sales_summary",
    description:
      "Revenue, order count, and average order value over the last N days, broken down by channel.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window size in days. Default 7. Max 90." },
      },
    },
  },
  {
    name: "get_top_products",
    description:
      "Top-selling products by revenue over the last N days. Returns name, category, units sold, revenue, and percentage of total revenue.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window size in days. Default 30." },
        limit: { type: "number", description: "How many products to return. Default 5, max 20." },
      },
    },
  },
  {
    name: "forecast_demand",
    description:
      "Forecast units sold next week for a specific product, by comparing the most recent 7 days vs the prior 7 days. Returns the trend direction and the projection.",
    input_schema: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description: "Partial product name (e.g. 'pistachio kunafa').",
        },
      },
      required: ["product_name"],
    },
  },
  {
    name: "recommend_reorder",
    description:
      "For ingredients at or below threshold, recommend a reorder quantity. The recommendation is based on the recent burn rate (last 14 days) and a target of 14 days of forward stock. Returns ingredient, days of stock remaining, recommended order quantity in the ingredient's unit, supplier, and estimated cost.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_recipes_using_ingredient",
    description:
      "Show every product whose recipe includes a given ingredient, with the per-unit quantity. Use this to explain cascading inventory pressure.",
    input_schema: {
      type: "object",
      properties: {
        ingredient_name: { type: "string", description: "Partial ingredient name." },
      },
      required: ["ingredient_name"],
    },
  },
  {
    name: "get_waste",
    description:
      "Recent waste events: which ingredient, how much, why, when. Useful when answering 'where are we losing inventory?'",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Window size in days. Default 30." },
      },
    },
  },
];

// ─── Tool executors ──────────────────────────────────────────────────────────

const stockStatusOf = (current: number, threshold: number) =>
  current <= 0 ? "out" : current < threshold * 0.5 ? "critical" : current < threshold ? "low" : "healthy";

async function getInventoryStatus(args: { name_filter?: string }) {
  const rows = await db.execute<{
    name: string;
    unit: string;
    current_stock: string;
    reorder_threshold: string;
    supplier: string | null;
  }>(sql`
    select i.name, i.unit::text as unit, i.current_stock::text, i.reorder_threshold::text,
           s.name as supplier
    from ingredients i
    left join suppliers s on s.id = i.supplier_id
    ${args.name_filter ? sql`where i.name ilike ${"%" + args.name_filter + "%"}` : sql``}
    order by (i.current_stock / nullif(i.reorder_threshold, 0)) asc nulls last, i.name
  `);
  return rows.map((r) => {
    const stock = Number(r.current_stock);
    const thr = Number(r.reorder_threshold);
    return {
      name: r.name,
      unit: r.unit,
      current_stock: stock,
      reorder_threshold: thr,
      status: stockStatusOf(stock, thr),
      supplier: r.supplier ?? null,
    };
  });
}

async function getLowStock() {
  // Burn rate: avg daily consumption from sale movements over last 14 days
  const rows = await db.execute<{
    name: string;
    unit: string;
    current_stock: string;
    reorder_threshold: string;
    burn_per_day: string;
  }>(sql`
    select i.name, i.unit::text as unit, i.current_stock::text, i.reorder_threshold::text,
      (
        select coalesce(sum(abs(m.delta)), 0) / 14.0
        from stock_movements m
        where m.ingredient_id = i.id and m.reason = 'sale'
          and m.created_at >= now() - interval '14 days'
      )::text as burn_per_day
    from ingredients i
    where i.current_stock < i.reorder_threshold
    order by (i.current_stock / nullif(i.reorder_threshold, 0)) asc nulls last
  `);
  return rows.map((r) => {
    const stock = Number(r.current_stock);
    const thr = Number(r.reorder_threshold);
    const burn = Number(r.burn_per_day);
    return {
      name: r.name,
      unit: r.unit,
      current_stock: stock,
      reorder_threshold: thr,
      status: stockStatusOf(stock, thr),
      burn_per_day: Number(burn.toFixed(2)),
      days_of_stock_remaining: burn > 0 ? Number((Math.max(stock, 0) / burn).toFixed(1)) : null,
    };
  });
}

async function getSalesSummary(args: { days?: number }) {
  const days = Math.min(Math.max(args.days ?? 7, 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const byChannel = await db
    .select({
      channel: orders.channel,
      revenue_fils: sql<string>`coalesce(sum(${orders.totalFils}), 0)`,
      order_count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(gte(orders.createdAt, since))
    .groupBy(orders.channel);

  const total_fils = byChannel.reduce((s, r) => s + Number(r.revenue_fils), 0);
  const total_orders = byChannel.reduce((s, r) => s + r.order_count, 0);

  return {
    days,
    total_revenue_aed: total_fils / 100,
    total_orders,
    average_order_value_aed: total_orders > 0 ? Number(((total_fils / 100) / total_orders).toFixed(2)) : 0,
    by_channel: byChannel.map((r) => ({
      channel: r.channel,
      revenue_aed: Number(r.revenue_fils) / 100,
      order_count: r.order_count,
    })),
  };
}

async function getTopProducts(args: { days?: number; limit?: number }) {
  const days = Math.min(Math.max(args.days ?? 30, 1), 90);
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      name: products.name,
      category: products.category,
      units: sql<number>`sum(${orderItems.quantity})::int`,
      revenue_fils: sql<string>`sum(${orderItems.quantity} * ${orderItems.unitPriceFils})`,
    })
    .from(orderItems)
    .innerJoin(products, eq(products.id, orderItems.productId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(gte(orders.createdAt, since))
    .groupBy(products.id, products.name, products.category)
    .orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.unitPriceFils})`))
    .limit(limit);

  const total = rows.reduce((s, r) => s + Number(r.revenue_fils), 0);

  return {
    days,
    products: rows.map((r) => ({
      name: r.name,
      category: r.category,
      units_sold: r.units,
      revenue_aed: Number(r.revenue_fils) / 100,
      pct_of_total: total > 0 ? Number(((Number(r.revenue_fils) / total) * 100).toFixed(1)) : 0,
    })),
  };
}

async function forecastDemand(args: { product_name: string }) {
  const [product] = await db.select().from(products).where(ilike(products.name, `%${args.product_name}%`)).limit(1);
  if (!product) return { error: `No product matched '${args.product_name}'.` };

  const result = await db.execute<{ recent: string; prior: string }>(sql`
    select
      coalesce(sum(case when o.created_at >= now() - interval '7 days' then oi.quantity end), 0)::text as recent,
      coalesce(sum(case when o.created_at >= now() - interval '14 days'
                     and o.created_at <  now() - interval '7 days' then oi.quantity end), 0)::text as prior
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.product_id = ${product.id}
  `);
  const recent = Number(result[0]?.recent ?? 0);
  const prior = Number(result[0]?.prior ?? 0);
  const change_pct = prior > 0 ? Number((((recent - prior) / prior) * 100).toFixed(1)) : null;
  const projected_next_week = Math.round(recent + (recent - prior));

  return {
    product: product.name,
    units_last_7_days: recent,
    units_prior_7_days: prior,
    week_over_week_change_pct: change_pct,
    projected_units_next_week: Math.max(0, projected_next_week),
  };
}

async function recommendReorder() {
  // Same as low-stock plus a target of 14 days forward stock.
  const TARGET_DAYS = 14;
  const rows = await db.execute<{
    id: string;
    name: string;
    unit: string;
    current_stock: string;
    reorder_threshold: string;
    cost_per_unit: string;
    burn_per_day: string;
    supplier: string | null;
  }>(sql`
    select i.id, i.name, i.unit::text as unit, i.current_stock::text,
      i.reorder_threshold::text, i.cost_per_unit_fils::text as cost_per_unit,
      (
        select coalesce(sum(abs(m.delta)), 0) / 14.0
        from stock_movements m
        where m.ingredient_id = i.id and m.reason = 'sale'
          and m.created_at >= now() - interval '14 days'
      )::text as burn_per_day,
      s.name as supplier
    from ingredients i
    left join suppliers s on s.id = i.supplier_id
    where i.current_stock < i.reorder_threshold
    order by (i.current_stock / nullif(i.reorder_threshold, 0)) asc nulls last
  `);

  return rows.map((r) => {
    const stock = Math.max(Number(r.current_stock), 0);
    const burn = Number(r.burn_per_day);
    const cost = Number(r.cost_per_unit);
    const target = burn * TARGET_DAYS;
    const recommended = Math.max(target - stock, Number(r.reorder_threshold) - stock);
    const rounded = Math.ceil(recommended / 100) * 100; // round up to nearest 100 in base unit
    return {
      ingredient: r.name,
      unit: r.unit,
      current_stock: stock,
      burn_per_day: Number(burn.toFixed(2)),
      days_remaining: burn > 0 ? Number((stock / burn).toFixed(1)) : null,
      recommended_order_qty: rounded,
      estimated_cost_aed: Number(((rounded * cost) / 100).toFixed(2)),
      supplier: r.supplier ?? null,
    };
  });
}

async function getRecipesUsingIngredient(args: { ingredient_name: string }) {
  const [ingredient] = await db
    .select()
    .from(ingredients)
    .where(ilike(ingredients.name, `%${args.ingredient_name}%`))
    .limit(1);
  if (!ingredient) return { error: `No ingredient matched '${args.ingredient_name}'.` };

  const rows = await db
    .select({
      product_name: products.name,
      category: products.category,
      product_price_fils: products.priceFils,
      qty_per_unit: recipes.quantityPerUnit,
    })
    .from(recipes)
    .innerJoin(products, eq(products.id, recipes.productId))
    .where(eq(recipes.ingredientId, ingredient.id))
    .orderBy(desc(recipes.quantityPerUnit));

  return {
    ingredient: ingredient.name,
    unit: ingredient.unit,
    products: rows.map((r) => ({
      product: r.product_name,
      category: r.category,
      price_aed: r.product_price_fils / 100,
      qty_per_unit: Number(r.qty_per_unit),
    })),
  };
}

async function getWaste(args: { days?: number }) {
  const days = Math.min(Math.max(args.days ?? 30, 1), 365);
  const rows = await db.execute<{
    name: string;
    unit: string;
    delta: string;
    note: string | null;
    created_at: string;
  }>(sql`
    select i.name, i.unit::text as unit, m.delta::text, m.note, m.created_at::text
    from stock_movements m
    join ingredients i on i.id = m.ingredient_id
    where m.reason = 'waste' and m.created_at >= now() - (${days}::int * interval '1 day')
    order by m.created_at desc
  `);
  return rows.map((r) => ({
    ingredient: r.name,
    unit: r.unit,
    quantity_lost: Math.abs(Number(r.delta)),
    note: r.note,
    when: r.created_at,
  }));
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_inventory_status":         return getInventoryStatus(input as { name_filter?: string });
    case "get_low_stock":                return getLowStock();
    case "get_sales_summary":            return getSalesSummary(input as { days?: number });
    case "get_top_products":             return getTopProducts(input as { days?: number; limit?: number });
    case "forecast_demand":              return forecastDemand(input as { product_name: string });
    case "recommend_reorder":            return recommendReorder();
    case "get_recipes_using_ingredient": return getRecipesUsingIngredient(input as { ingredient_name: string });
    case "get_waste":                    return getWaste(input as { days?: number });
    default: return { error: `Unknown tool: ${name}` };
  }
}
