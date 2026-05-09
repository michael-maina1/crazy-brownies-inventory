"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Subscribes to Postgres changes on `ingredients` and `orders` and triggers a
 * Server-Component refresh on each change. Drop this component once anywhere
 * inside the app shell — it has no UI of its own.
 *
 * Realtime updates are already coalesced server-side; we additionally debounce
 * router.refresh() so a burst of movements (one sale → many ingredient updates)
 * results in a single re-render pass.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const queue = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel("crazy-brownies-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ingredients" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, queue)
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
