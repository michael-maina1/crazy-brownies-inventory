import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const stock = await sql`
    select name, unit, current_stock::numeric, reorder_threshold::numeric,
      case
        when current_stock <= 0 then 'OUT'
        when current_stock < reorder_threshold * 0.5 then 'CRITICAL'
        when current_stock < reorder_threshold then 'LOW'
        else 'HEALTHY'
      end as status
    from ingredients
    order by (current_stock / nullif(reorder_threshold,0)) asc nulls last, name
  `;
  console.log("\nInventory:");
  for (const s of stock) {
    console.log(`  ${s.status.padEnd(8)} ${s.name.padEnd(48)} ${Number(s.current_stock).toFixed(0).padStart(8)} ${s.unit}  (reorder @ ${Number(s.reorder_threshold).toFixed(0)})`);
  }

  const top = await sql`
    select p.name, sum(oi.quantity)::int as units, sum(oi.quantity * oi.unit_price_fils)::int as revenue_fils
    from order_items oi
    join products p on p.id = oi.product_id
    group by p.name
    order by revenue_fils desc
  `;
  console.log("\nTop products by revenue (30 days):");
  for (const t of top) {
    console.log(`  ${t.name.padEnd(40)} ${String(t.units).padStart(5)} units   AED ${(t.revenue_fils / 100).toFixed(2)}`);
  }

  const totals = await sql`
    select count(*)::int as orders, sum(total_fils)::bigint as revenue_fils
    from orders
  `;
  console.log(`\nTotal: ${totals[0].orders} orders, AED ${(Number(totals[0].revenue_fils) / 100).toFixed(2)}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
