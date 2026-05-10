import "server-only";
import { db } from "@/db/client";
import { products, orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allocateFromBatchesFIFO } from "@/lib/production";

type OrderChannel = "in_store" | "website" | "deliveroo" | "corporate";

const CHANNEL_WEIGHTS: { channel: OrderChannel; weight: number }[] = [
  { channel: "in_store",  weight: 0.35 },
  { channel: "deliveroo", weight: 0.30 },
  { channel: "website",   weight: 0.25 },
  { channel: "corporate", weight: 0.10 },
];

function weightedChannel(): OrderChannel {
  const r = Math.random();
  let acc = 0;
  for (const c of CHANNEL_WEIGHTS) {
    acc += c.weight;
    if (r <= acc) return c.channel;
  }
  return "in_store";
}

const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};

/**
 * Insert a synthetic order through the same write path as a real sale.
 * Used by the demo "live traffic" cron so the dashboard ticks visibly during
 * the screen recording. Disabled in production via SIMULATOR_OFF=true.
 */
export async function simulateOrder() {
  // Pull active products + their recipes once.
  const allProducts = await db
    .select({ id: products.id, name: products.name, priceFils: products.priceFils })
    .from(products)
    .where(eq(products.active, true));

  if (allProducts.length === 0) return { skipped: "no products" };

  // Bestsellers get extra weight: pistachio kunafa + bueno + hero brownies.
  const heroNames = [
    "Viral Pistachio Kunafa Bar",
    "Bueno Bar",
    "12-Pack Box",
    "6-Pack Box",
  ];
  const weighted = allProducts.flatMap((p) =>
    heroNames.some((h) => p.name.toLowerCase().includes(h.toLowerCase())) ? [p, p, p] : [p],
  );

  // 1–3 line items per order.
  const lineCount = 1 + Math.floor(Math.random() * 3);
  const picked = pickN(weighted, lineCount);
  // De-dup by product id (heroes can be picked twice through weighting).
  const linesByProduct = new Map<string, { productId: string; qty: number; priceFils: number }>();
  for (const p of picked) {
    const existing = linesByProduct.get(p.id);
    const qty = 1 + Math.floor(Math.random() * 2); // 1–2 units
    if (existing) {
      existing.qty += qty;
    } else {
      linesByProduct.set(p.id, { productId: p.id, qty, priceFils: p.priceFils });
    }
  }
  const lines = Array.from(linesByProduct.values());

  // Path A model: simulator sales debit finished-good batches via FIFO. If a
  // product hasn't been baked yet under the new system, the order is recorded
  // but no inventory effect — that's correct, the bake will happen later.
  const totalFils = lines.reduce((s, l) => s + l.priceFils * l.qty, 0);
  const channel = weightedChannel();

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        channel,
        totalFils,
        customerNote: null,
        status: "fulfilled",
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        quantity: l.qty,
        unitPriceFils: l.priceFils,
      })),
    );

    for (const line of lines) {
      await allocateFromBatchesFIFO(tx, {
        productId: line.productId,
        qty: line.qty,
        orderId: order.id,
      });
    }
  });

  return { channel, lines: lines.length, totalFils };
}
