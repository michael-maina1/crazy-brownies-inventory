import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Role = "owner" | "manager" | "staff";

export async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  return profile ?? null;
}

export async function requireProfile() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export function isManagerOrOwner(role: Role) {
  return role === "owner" || role === "manager";
}
