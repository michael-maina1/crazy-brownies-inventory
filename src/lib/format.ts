/**
 * Formatting helpers. Money lives in the DB as integer fils (1 AED = 100 fils);
 * format with these helpers at the UI boundary, never with raw division in components.
 */

const AED = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});

const AED_PRECISE = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT = new Intl.NumberFormat("en-AE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatAED(fils: number | string | null | undefined, opts?: { precise?: boolean }) {
  const n = typeof fils === "string" ? Number(fils) : fils ?? 0;
  if (!Number.isFinite(n)) return "—";
  const aed = n / 100;
  return opts?.precise ? AED_PRECISE.format(aed) : AED.format(aed);
}

export function formatAEDCompact(fils: number | string | null | undefined) {
  const n = typeof fils === "string" ? Number(fils) : fils ?? 0;
  if (!Number.isFinite(n)) return "—";
  return `AED ${COMPACT.format(n / 100)}`;
}

export function formatQuantity(value: number | string, unit: "g" | "ml" | "ea") {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  if (unit === "ea") return `${Math.round(n).toLocaleString("en-AE")}`;
  // g and ml: scale to kg/L when ≥ 1000
  if (Math.abs(n) >= 1000) {
    const big = (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1);
    return `${big} ${unit === "g" ? "kg" : "L"}`;
  }
  return `${n.toFixed(0)} ${unit}`;
}

export function unitLabel(unit: "g" | "ml" | "ea") {
  return unit === "ea" ? "units" : unit;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatRelative(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return RELATIVE.format(Math.round(diff), "second");
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), "hour");
  return RELATIVE.format(Math.round(diff / 86400), "day");
}

export function stockStatus(currentStock: number | string, threshold: number | string) {
  const stock = typeof currentStock === "string" ? Number(currentStock) : currentStock;
  const t = typeof threshold === "string" ? Number(threshold) : threshold;
  if (stock <= 0) return "out" as const;
  if (stock < t * 0.5) return "critical" as const;
  if (stock < t) return "low" as const;
  return "healthy" as const;
}

export type StockStatus = ReturnType<typeof stockStatus>;
