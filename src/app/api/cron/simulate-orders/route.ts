import { NextResponse } from "next/server";
import { simulateOrder } from "@/lib/demo/simulate";
import { checkLowStockAlert } from "@/lib/alerts/triggers";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

/**
 * Demo "live traffic" generator. Drops 1–3 synthetic orders per invocation
 * through the same write path as a real sale. Disabled by default; flip
 * SIMULATOR_ON=true on Vercel for the recording window.
 *
 * Auth: optional CRON_SECRET (Bearer token) — Vercel Cron sends this when
 * configured; ad-hoc browser hits work without it for fast iteration.
 */
export async function GET(req: Request) {
  if (process.env.SIMULATOR_ON !== "true") {
    return NextResponse.json({ skipped: true, reason: "SIMULATOR_ON not set" });
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    // Accept either matching Bearer or vercel-cron user-agent (free tier sends UA).
    const ua = req.headers.get("user-agent") ?? "";
    if (auth !== `Bearer ${secret}` && !ua.startsWith("vercel-cron")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const count = 1 + Math.floor(Math.random() * 3);
  const results: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const r = await simulateOrder();
    results.push(r);
  }

  // Fire low-stock checks for any ingredients touched in this batch, deduped
  // by the alert dispatch layer.
  const recentlyTouched = await db.execute<{ ingredient_id: string }>(sql`
    select distinct m.ingredient_id::text as ingredient_id
    from stock_movements m
    join orders o on o.id = m.order_id
    where m.reason = 'sale' and o.created_at > now() - interval '30 seconds'
  `);
  await Promise.all(
    recentlyTouched.map((r) => checkLowStockAlert(r.ingredient_id).catch(() => undefined)),
  );

  return NextResponse.json({ ok: true, orders_dropped: results.length, results });
}
