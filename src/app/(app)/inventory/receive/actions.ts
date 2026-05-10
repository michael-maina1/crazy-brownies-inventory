"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { receiveDelivery } from "@/lib/stock";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";

const receiveSchema = z.object({
  ingredientId: z.string().uuid(),
  supplierId: z.string().uuid().optional().nullable(),
  batchCode: z.string().trim().max(80).optional().nullable(),
  quantity: z.coerce.number().refine((n) => Number.isFinite(n) && n > 0, "Quantity must be positive"),
  costAed: z.coerce.number().min(0, "Cost cannot be negative"),
  expiresAt: z.string().optional().nullable(), // YYYY-MM-DD
  note: z.string().trim().max(200).optional().nullable(),
});

export async function recordDelivery(_prev: unknown, formData: FormData) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return { error: "Only managers and owners can receive deliveries." };
  }

  const parsed = receiveSchema.safeParse({
    ingredientId: formData.get("ingredientId"),
    supplierId: formData.get("supplierId") || undefined,
    batchCode: formData.get("batchCode") || undefined,
    quantity: formData.get("quantity"),
    costAed: formData.get("costAed"),
    expiresAt: formData.get("expiresAt") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { error: "Invalid expiry date" };
  }

  await receiveDelivery({
    ingredientId: parsed.data.ingredientId,
    supplierId: parsed.data.supplierId || null,
    batchCode: parsed.data.batchCode || null,
    quantity: parsed.data.quantity,
    costFils: Math.round(parsed.data.costAed * 100),
    expiresAt,
    note: parsed.data.note || null,
    createdBy: profile.id,
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/receive");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
