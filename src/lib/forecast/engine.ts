import { db } from "../../db/client";
import { sql } from "drizzle-orm";

/**
 * Tier 1 demand forecasting.
 *
 * Method (per product):
 *   1. Pull the last 56 days of daily unit-sales.
 *   2. Compute a 28-day baseline.
 *   3. Compute day-of-week seasonality factors (each weekday's mean / overall mean).
 *   4. Compute a trend slope via simple linear regression on the last 28 days.
 *   5. Apply UAE holiday / Ramadan boosts when the forecast date falls in the
 *      relevant window.
 *   6. Predicted units = round(baseline · dowFactor · (1 + trend) · holidayBoost).
 *   7. Bounds = ±1.5 · residual stddev, clipped at zero.
 *
 * This is statistical, not a learned model — but it's structurally identical to
 * how production batch-forecasting pipelines behave. The Phase-2 paid swap-in
 * is a Python service implementing the same `ForecastResult` contract.
 */

export const FORECAST_MODEL_VERSION = "tier1-hw-v1";

export type ForecastDriver = {
  baseline_28d: number;
  dow_factor: number;
  trend_pct: number;
  holiday_boost: number;
  holiday_label: string | null;
  sample_days: number;
};

export type ForecastResult = {
  productId: string;
  forecastDate: string; // YYYY-MM-DD
  predictedUnits: number;
  lowerBound: number;
  upperBound: number;
  drivers: ForecastDriver;
};

const DAY_MS = 1000 * 60 * 60 * 24;

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * UAE-relevant calendar boosts. Multiplicative factors applied on top of
 * baseline · dow · trend. Approximate Ramadan/Eid windows for the next two
 * years — refined when a real model lands.
 */
const HOLIDAY_WINDOWS: { label: string; start: string; end: string; boost: number }[] = [
  { label: "Ramadan",          start: "2026-02-17", end: "2026-03-19", boost: 1.18 },
  { label: "Eid al-Fitr",      start: "2026-03-20", end: "2026-03-23", boost: 1.45 },
  { label: "Mother's Day (UAE)", start: "2026-03-21", end: "2026-03-21", boost: 1.65 },
  { label: "Eid al-Adha",      start: "2026-05-26", end: "2026-05-29", boost: 1.40 },
  { label: "UAE National Day", start: "2026-12-02", end: "2026-12-03", boost: 1.30 },
  { label: "Ramadan",          start: "2027-02-06", end: "2027-03-08", boost: 1.18 },
];

function holidayFactor(date: string): { boost: number; label: string | null } {
  for (const h of HOLIDAY_WINDOWS) {
    if (date >= h.start && date <= h.end) return { boost: h.boost, label: h.label };
  }
  return { boost: 1, label: null };
}

function linearTrendSlope(values: number[]): number {
  // Returns slope as a fraction-of-mean change per day (e.g. 0.012 = +1.2% / day).
  // Used to project forward; clipped to ±10%/day to avoid nonsense from spiky data.
  const n = values.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  if (meanY <= 0) return 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 0;
  const slopeAbs = num / den;
  const slopePct = slopeAbs / meanY;
  return Math.max(-0.1, Math.min(0.1, slopePct));
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

type DailyRow = { product_id: string; day: string; units: string };

async function loadHistory(daysBack: number): Promise<Map<string, Map<string, number>>> {
  // Map: productId → (day → units)
  const rows = await db.execute<DailyRow>(sql`
    select
      oi.product_id::text as product_id,
      date_trunc('day', o.created_at)::date::text as day,
      coalesce(sum(oi.quantity), 0)::text as units
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.created_at >= now() - (${daysBack}::int * interval '1 day')
    group by oi.product_id, date_trunc('day', o.created_at)
  `);

  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!out.has(r.product_id)) out.set(r.product_id, new Map());
    out.get(r.product_id)!.set(r.day, Number(r.units));
  }
  return out;
}

async function loadActiveProducts(): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select id::text as id, name from products where active = true
  `);
  return rows;
}

/**
 * Run the engine for `daysAhead` days starting tomorrow, for every active
 * product. Returns the rows ready to be UPSERTed.
 */
export async function runForecast(daysAhead = 7): Promise<ForecastResult[]> {
  const HISTORY_DAYS = 56;
  const history = await loadHistory(HISTORY_DAYS);
  const products = await loadActiveProducts();

  // Build the date series we're predicting (starts tomorrow).
  const now = new Date();
  const startDay = new Date(now);
  startDay.setUTCHours(0, 0, 0, 0);
  startDay.setUTCDate(startDay.getUTCDate() + 1);

  // Build the day-list we have history for: last 28 actual days.
  const last28: string[] = [];
  for (let i = 28; i >= 1; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    last28.push(toIsoDate(d));
  }

  const results: ForecastResult[] = [];

  for (const product of products) {
    const series = history.get(product.id) ?? new Map<string, number>();
    const last28Values = last28.map((d) => series.get(d) ?? 0);
    const baseline28 = last28Values.reduce((a, b) => a + b, 0) / 28;

    // Day-of-week factor: mean(dow values) / mean(all values), clamped 0.4–2.0.
    // Falls back to 1.0 when we don't have enough samples for that weekday.
    const dowMeans = new Map<number, number[]>();
    for (let i = 0; i < last28.length; i++) {
      const dow = new Date(last28[i] + "T00:00:00Z").getUTCDay();
      if (!dowMeans.has(dow)) dowMeans.set(dow, []);
      dowMeans.get(dow)!.push(last28Values[i]);
    }
    const dowFactor: Record<number, number> = {};
    for (const [dow, vals] of dowMeans) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const factor = baseline28 > 0 ? mean / baseline28 : 1;
      dowFactor[dow] = Math.max(0.4, Math.min(2.0, factor || 1));
    }

    const trendPct = linearTrendSlope(last28Values);
    const sigma = stddev(last28Values);

    for (let h = 0; h < daysAhead; h++) {
      const target = new Date(startDay);
      target.setUTCDate(target.getUTCDate() + h);
      const dateStr = toIsoDate(target);
      const dow = target.getUTCDay();
      const dowF = dowFactor[dow] ?? 1;
      const { boost: holidayB, label: holidayLabel } = holidayFactor(dateStr);
      // Project forward h+1 days of trend into the multiplier.
      const trendMult = 1 + trendPct * (h + 1);

      const expected = Math.max(0, baseline28 * dowF * trendMult * holidayB);
      const predictedUnits = Math.round(expected);
      const halfBand = 1.5 * sigma;
      const lowerBound = Math.max(0, Math.round(expected - halfBand));
      const upperBound = Math.max(predictedUnits, Math.round(expected + halfBand));

      results.push({
        productId: product.id,
        forecastDate: dateStr,
        predictedUnits,
        lowerBound,
        upperBound,
        drivers: {
          baseline_28d: Number(baseline28.toFixed(2)),
          dow_factor: Number(dowF.toFixed(3)),
          trend_pct: Number((trendPct * 100).toFixed(2)),
          holiday_boost: Number(holidayB.toFixed(2)),
          holiday_label: holidayLabel,
          sample_days: last28Values.filter((v) => v > 0).length,
        },
      });
    }
  }

  return results;
}

/**
 * Persist a batch of forecast rows. Idempotent on (product, date, model_version).
 */
export async function upsertForecasts(rows: ForecastResult[]) {
  if (rows.length === 0) return;
  // Insert one at a time for clarity; volume is tiny (~30 products × 7 days = 210/day).
  for (const r of rows) {
    await db.execute(sql`
      insert into forecasts
        (product_id, forecast_date, predicted_units, lower_bound, upper_bound,
         model_version, drivers, generated_at)
      values
        (${r.productId}::uuid, ${r.forecastDate}::date, ${r.predictedUnits}::int,
         ${r.lowerBound}::int, ${r.upperBound}::int,
         ${FORECAST_MODEL_VERSION}, ${JSON.stringify(r.drivers)}::jsonb, now())
      on conflict (product_id, forecast_date, model_version)
      do update set
        predicted_units = excluded.predicted_units,
        lower_bound = excluded.lower_bound,
        upper_bound = excluded.upper_bound,
        drivers = excluded.drivers,
        generated_at = now()
    `);
  }
}
