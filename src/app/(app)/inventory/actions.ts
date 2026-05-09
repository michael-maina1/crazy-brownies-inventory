"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { recordStockMovement } from "@/lib/stock";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";

const adjustSchema = z.object({
  ingredientId: z.string().uuid(),
  delta: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "Enter a non-zero quantity"),
  reason: z.enum(["restock", "waste", "adjustment", "recount"]),
  note: z.string().max(200).optional(),
});

export async function adjustStock(_prev: unknown, formData: FormData) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return { error: "Only managers and owners can adjust inventory." };
  }

  const parsed = adjustSchema.safeParse({
    ingredientId: formData.get("ingredientId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await recordStockMovement({
    ingredientId: parsed.data.ingredientId,
    delta: parsed.data.delta,
    reason: parsed.data.reason,
    note: parsed.data.note,
    createdBy: profile.id,
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
