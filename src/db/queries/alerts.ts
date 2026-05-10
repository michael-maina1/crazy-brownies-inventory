import "server-only";
import { db } from "@/db/client";
import { alertSubscriptions, alertsLog } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function getAlertSubscriptions() {
  return db
    .select()
    .from(alertSubscriptions)
    .orderBy(desc(alertSubscriptions.createdAt));
}

export async function getRecentAlerts(limit = 25) {
  return db
    .select()
    .from(alertsLog)
    .orderBy(desc(alertsLog.createdAt))
    .limit(limit);
}
