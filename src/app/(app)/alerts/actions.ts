"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { alertSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";
import { dispatchAlert } from "@/lib/alerts/dispatch";

const createSchema = z.object({
  email: z.string().email(),
  label: z.string().trim().max(80).optional().nullable(),
  eventLowStock: z.coerce.boolean().optional(),
  eventExpiring: z.coerce.boolean().optional(),
  eventDailySummary: z.coerce.boolean().optional(),
});

export async function addSubscription(_prev: unknown, formData: FormData) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return { error: "Only managers and owners can manage alerts." };
  }

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    label: formData.get("label") || undefined,
    eventLowStock: formData.get("eventLowStock") === "on",
    eventExpiring: formData.get("eventExpiring") === "on",
    eventDailySummary: formData.get("eventDailySummary") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  await db.insert(alertSubscriptions).values({
    email: parsed.data.email,
    label: parsed.data.label || null,
    eventLowStock: parsed.data.eventLowStock ?? true,
    eventExpiring: parsed.data.eventExpiring ?? true,
    eventDailySummary: parsed.data.eventDailySummary ?? false,
  });

  revalidatePath("/alerts");
  return { ok: true as const };
}

export async function deleteSubscription(formData: FormData) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.id, id));
  revalidatePath("/alerts");
}

export async function sendTestAlert() {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) return { error: "Forbidden" } as const;
  const result = await dispatchAlert({
    event: "low_stock",
    subject: "[Crazy Brownies] Test alert",
    body: "This is a test from the AI Inventory Command Center. If you received this, alerts are wired correctly.",
  });
  return { ok: true as const, ...result };
}
