import { NextResponse } from "next/server";
import { getExpiringSoonBatches, getExpiringSoonSummary } from "@/db/queries/batches";
import { dispatchAlert } from "@/lib/alerts/dispatch";
import { formatQuantity } from "@/lib/format";

/**
 * Daily expiring-batch alert. Fires once per day (Vercel Cron at 06:00 UTC,
 * see vercel.json) and emails subscribers with the day's at-risk batches.
 *
 * Dedupe is handled inside `dispatchAlert` so a manual trigger during the
 * demo recording doesn't double-fire the morning email.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const summary = await getExpiringSoonSummary(7);
  if (summary.batches === 0) {
    return NextResponse.json({ skipped: true, reason: "nothing expiring within 7 days" });
  }

  const batches = await getExpiringSoonBatches(7, 20);
  const today = new Date().toISOString().slice(0, 10);
  const subject = `[Crazy Brownies] ${summary.batches} batch${
    summary.batches === 1 ? "" : "es"
  } expiring this week — AED ${(summary.aedAtRiskFils / 100).toFixed(0)} at risk`;

  const lines = [
    `Morning. Heads-up on the freshness pipeline as of ${today}:`,
    "",
    `• ${summary.batches} batches expiring within 7 days`,
    `• AED ${(summary.aedAtRiskFils / 100).toFixed(0)} at risk`,
    summary.expiredCount > 0 ? `• ${summary.expiredCount} already expired — discard or process today` : null,
    "",
    "Top items by urgency:",
    ...batches.slice(0, 8).map((b) => {
      const date = b.expiresAt
        ? new Date(b.expiresAt).toLocaleDateString("en-AE", { day: "numeric", month: "short" })
        : "—";
      return `  – ${b.ingredientName}: ${formatQuantity(b.quantityRemaining, b.unit)} expires ${date}`;
    }),
    "",
    "Open the dashboard for the full picture and to log usage / waste.",
  ].filter(Boolean) as string[];

  const result = await dispatchAlert({
    event: "expiring_soon",
    subject,
    body: lines.join("\n"),
  });

  return NextResponse.json({ ok: true, summary, ...result });
}
