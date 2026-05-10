import "server-only";
import { db } from "@/db/client";
import { alertSubscriptions, alertsLog } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type AlertEvent = "low_stock" | "expiring_soon" | "daily_summary";

const FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? "Crazy Brownies Ops <onboarding@resend.dev>";
const DEDUPE_HOURS = 12;

/**
 * Dispatch an alert to every active subscriber for the given event. Each
 * recipient gets one row in `alerts_log`, regardless of send-success — failures
 * are stored with `status='failed'` so the operator can debug from the UI.
 *
 * Dedupe: if the *same* event + recipient + subject was sent in the last
 * DEDUPE_HOURS hours, the new alert is dropped silently. Stops the same
 * "Pistachio Cream is low" email firing on every subsequent sale.
 */
export async function dispatchAlert(args: {
  event: AlertEvent;
  subject: string;
  body: string;
}) {
  const recipientField =
    args.event === "low_stock"
      ? alertSubscriptions.eventLowStock
      : args.event === "expiring_soon"
        ? alertSubscriptions.eventExpiring
        : alertSubscriptions.eventDailySummary;

  const subs = await db
    .select({ email: alertSubscriptions.email })
    .from(alertSubscriptions)
    .where(and(eq(alertSubscriptions.enabled, true), eq(recipientField, true)));

  if (subs.length === 0) return { sent: 0, deduped: 0, failed: 0 };

  const apiKey = process.env.RESEND_API_KEY;
  let sent = 0;
  let deduped = 0;
  let failed = 0;

  for (const sub of subs) {
    // Dedupe per-recipient+subject within the rolling window.
    const recent = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from alerts_log
      where event_type = ${args.event}
        and recipient_email = ${sub.email}
        and subject = ${args.subject}
        and created_at > now() - interval '${sql.raw(String(DEDUPE_HOURS))} hours'
        and status in ('sent','queued')
    `);
    if ((recent[0]?.count ?? 0) > 0) {
      deduped++;
      continue;
    }

    let status: "sent" | "failed" | "queued" = "queued";
    let error: string | null = null;
    if (apiKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: sub.email,
            subject: args.subject,
            text: args.body,
          }),
        });
        if (res.ok) {
          status = "sent";
          sent++;
        } else {
          status = "failed";
          error = `Resend ${res.status}: ${await res.text()}`.slice(0, 500);
          failed++;
        }
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
        failed++;
      }
    } else {
      // Demo / dev mode without RESEND_API_KEY: log as queued so the operator
      // can still see the alert UI working without an external key.
      status = "queued";
    }

    await db.insert(alertsLog).values({
      eventType: args.event,
      subject: args.subject,
      bodyText: args.body,
      recipientEmail: sub.email,
      status,
      errorMessage: error,
      sentAt: status === "sent" ? new Date() : null,
    });
  }

  return { sent, deduped, failed };
}
