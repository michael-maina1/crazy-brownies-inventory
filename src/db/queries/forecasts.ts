import "server-only";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export type TomorrowForecastRow = {
  productId: string;
  productName: string;
  category: string;
  predictedUnits: number;
  lowerBound: number | null;
  upperBound: number | null;
  baseline28d: number;
  dowFactor: number;
  trendPct: number;
  holidayBoost: number;
  holidayLabel: string | null;
  forecastDate: string;
  generatedAt: Date;
};

/**
 * Forecast for "tomorrow" — the next calendar day from now (UTC). Joined to
 * products so the dashboard can render the human-readable name + category.
 */
export async function getTomorrowForecast(limit = 12): Promise<TomorrowForecastRow[]> {
  const rows = await db.execute<{
    product_id: string;
    product_name: string;
    category: string;
    predicted_units: number;
    lower_bound: number | null;
    upper_bound: number | null;
    drivers: Record<string, unknown>;
    forecast_date: string;
    generated_at: string;
  }>(sql`
    select f.product_id::text as product_id,
           p.name as product_name,
           p.category,
           f.predicted_units,
           f.lower_bound,
           f.upper_bound,
           f.drivers,
           f.forecast_date::text as forecast_date,
           f.generated_at::text as generated_at
    from forecasts f
    join products p on p.id = f.product_id
    where f.forecast_date = (current_date + interval '1 day')::date
    order by f.predicted_units desc
    limit ${limit}
  `);

  return rows.map((r) => {
    const d = (r.drivers ?? {}) as Record<string, unknown>;
    return {
      productId: r.product_id,
      productName: r.product_name,
      category: r.category,
      predictedUnits: r.predicted_units,
      lowerBound: r.lower_bound,
      upperBound: r.upper_bound,
      baseline28d: Number(d.baseline_28d ?? 0),
      dowFactor: Number(d.dow_factor ?? 1),
      trendPct: Number(d.trend_pct ?? 0),
      holidayBoost: Number(d.holiday_boost ?? 1),
      holidayLabel: (d.holiday_label as string | null) ?? null,
      forecastDate: r.forecast_date,
      generatedAt: new Date(r.generated_at),
    };
  });
}

/**
 * 7-day rollup per product, for the AI tool. Returns total predicted units
 * and the day-by-day series.
 */
export async function getWeekForecast(productId: string) {
  const rows = await db.execute<{
    forecast_date: string;
    predicted_units: number;
    lower_bound: number | null;
    upper_bound: number | null;
    drivers: Record<string, unknown>;
  }>(sql`
    select f.forecast_date::text as forecast_date,
           f.predicted_units, f.lower_bound, f.upper_bound, f.drivers
    from forecasts f
    where f.product_id = ${productId}::uuid
      and f.forecast_date >= current_date
      and f.forecast_date < current_date + interval '8 days'
    order by f.forecast_date
  `);
  return rows.map((r) => {
    const d = (r.drivers ?? {}) as Record<string, unknown>;
    return {
      date: r.forecast_date,
      predicted: r.predicted_units,
      lower: r.lower_bound,
      upper: r.upper_bound,
      holidayLabel: (d.holiday_label as string | null) ?? null,
      dowFactor: Number(d.dow_factor ?? 1),
    };
  });
}
