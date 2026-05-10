"use client";

import { useEffect } from "react";

/**
 * Fires window.print() once the labels page has rendered. Split into a tiny
 * client component so the rest of the labels page can stay a Server Component.
 */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return null;
}
