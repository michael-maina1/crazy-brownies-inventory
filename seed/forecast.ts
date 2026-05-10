/**
 * One-shot forecast cache populator. Run via: npx tsx seed/forecast.ts
 * In production this is replaced by the Vercel Cron at /api/cron/forecast.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  // Dynamic import so dotenv loads before the engine module reads process.env.
  const { runForecast, upsertForecasts } = await import("../src/lib/forecast/engine");
  const t0 = Date.now();
  const rows = await runForecast(7);
  await upsertForecasts(rows);
  process.stdout.write(`forecast: wrote ${rows.length} rows in ${Date.now() - t0}ms\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
