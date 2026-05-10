/**
 * Seed sample ingredient_batches so the freshness dashboard has data.
 * Idempotent: wipes the table first. Run via: npx tsx seed/batches.ts
 *
 * Distribution is intentional — a few batches expiring within 7 days drive a
 * non-trivial "AED at risk" KPI on the dashboard.
 */

import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

const daysFromNow = (d: number) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t;
};

async function main() {
  await db.execute(sql`delete from ingredient_batches`);

  // Pull every ingredient with its supplier + shelf life, plus current_stock so
  // we can apportion stock across plausible batches.
  const ings = await db.execute<{
    id: string;
    name: string;
    unit: string;
    current_stock: string;
    cost_per_unit_fils: string;
    supplier_id: string | null;
    shelf_life_days: number | null;
    is_perishable: boolean;
  }>(sql`
    select id, name, unit::text as unit, current_stock::text,
           cost_per_unit_fils::text, supplier_id,
           shelf_life_days, is_perishable
    from ingredients
    order by name
  `);

  type BatchRow = {
    ingredient_id: string;
    supplier_id: string | null;
    batch_code: string;
    received_at: Date;
    expires_at: Date | null;
    quantity_received: string;
    quantity_remaining: string;
    cost_fils: string;
  };
  const batches: BatchRow[] = [];

  for (const ing of ings) {
    const stock = Number(ing.current_stock);
    if (stock <= 0) continue;
    const costPerUnit = Number(ing.cost_per_unit_fils);
    const shelfDays = ing.shelf_life_days;

    // Splitting strategy:
    //   - perishables (≤30d shelf): split into 3 batches with stagger including
    //     one expiring within a week → drives the "expiring soon" KPI
    //   - mid shelf (≤120d): 2 batches at different ages
    //   - long shelf: single bulk batch received recently
    let plan: { qty: number; receivedDaysAgo: number; expiresInDays: number | null }[];

    if (shelfDays && shelfDays <= 30 && ing.is_perishable) {
      const ageA = Math.max(1, shelfDays - 6); // → expires in ~6d
      const ageB = Math.floor(shelfDays * 0.4); // → expires in ~60% of shelf
      plan = [
        { qty: stock * 0.35, receivedDaysAgo: ageA, expiresInDays: shelfDays - ageA },
        { qty: stock * 0.35, receivedDaysAgo: ageB, expiresInDays: shelfDays - ageB },
        { qty: stock * 0.30, receivedDaysAgo: 0,    expiresInDays: shelfDays },
      ];
    } else if (shelfDays && shelfDays <= 120) {
      plan = [
        { qty: stock * 0.45, receivedDaysAgo: Math.floor(shelfDays * 0.55), expiresInDays: Math.floor(shelfDays * 0.45) },
        { qty: stock * 0.55, receivedDaysAgo: Math.floor(shelfDays * 0.10), expiresInDays: Math.floor(shelfDays * 0.90) },
      ];
    } else if (shelfDays) {
      plan = [{ qty: stock, receivedDaysAgo: 14, expiresInDays: shelfDays - 14 }];
    } else {
      // non-perishable / unknown: single batch, no expiry
      plan = [{ qty: stock, receivedDaysAgo: 21, expiresInDays: null }];
    }

    plan.forEach((p, idx) => {
      const qty = Math.round(p.qty * 1000) / 1000;
      if (qty <= 0) return;
      batches.push({
        ingredient_id: ing.id,
        supplier_id: ing.supplier_id,
        batch_code: `B-${ing.name.split(" ")[0].toUpperCase().slice(0, 5)}-${daysFromNow(-p.receivedDaysAgo)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "")}-${idx + 1}`,
        received_at: daysFromNow(-p.receivedDaysAgo),
        expires_at: p.expiresInDays === null ? null : daysFromNow(p.expiresInDays),
        quantity_received: qty.toString(),
        quantity_remaining: qty.toString(),
        cost_fils: (qty * costPerUnit).toFixed(2),
      });
    });
  }

  // Bulk insert
  let inserted = 0;
  for (const b of batches) {
    await db.execute(sql`
      insert into ingredient_batches
        (ingredient_id, supplier_id, batch_code, received_at, expires_at,
         quantity_received, quantity_remaining, cost_fils)
      values
        (${b.ingredient_id}::uuid, ${b.supplier_id}::uuid, ${b.batch_code},
         ${b.received_at.toISOString()}::timestamptz,
         ${b.expires_at ? b.expires_at.toISOString() : null}::timestamptz,
         ${b.quantity_received}::numeric, ${b.quantity_remaining}::numeric,
         ${b.cost_fils}::numeric)
    `);
    inserted++;
  }

  process.stdout.write(`seeded ${inserted} ingredient batches\n`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
