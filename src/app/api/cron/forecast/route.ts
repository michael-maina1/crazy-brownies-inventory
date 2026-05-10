import { NextResponse } from "next/server";
import { runForecast, upsertForecasts } from "@/lib/forecast/engine";

/**
 * Daily forecast regeneration. Hit by a Vercel Cron (see `vercel.json`).
 * Also reachable manually for testing — the demo flow can re-trigger this
 * before recording.
 *
 * Auth: in production we'd require `Authorization: Bearer ${CRON_SECRET}`.
 * For the demo we accept either no header (public re-run) OR a matching
 * secret if `CRON_SECRET` is set, so the Vercel cron and a manual curl both
 * succeed without ceremony.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const t0 = Date.now();
  const rows = await runForecast(7);
  await upsertForecasts(rows);
  return NextResponse.json({
    ok: true,
    rows_written: rows.length,
    elapsed_ms: Date.now() - t0,
  });
}
