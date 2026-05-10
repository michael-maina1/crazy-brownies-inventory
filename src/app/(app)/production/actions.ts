"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startBake } from "@/lib/production";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";

const bakeSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(500),
  note: z.string().trim().max(200).optional().nullable(),
});

export async function startBakeAction(_prev: unknown, formData: FormData) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return { error: "Only managers and owners can start bakes." };
  }

  const parsed = bakeSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const batch = await startBake({
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    bakedBy: profile.id,
    note: parsed.data.note ?? undefined,
  });

  revalidatePath("/production");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/products");
  redirect(`/labels/${batch.id}?qty=${parsed.data.quantity}`);
}
