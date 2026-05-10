import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import type { TomorrowForecastRow } from "@/db/queries/forecasts";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-AE", { weekday: "long", day: "numeric", month: "short" });
};

export function ForecastWidget({ rows }: { rows: TomorrowForecastRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" /> Tomorrow&apos;s production plan
          </CardTitle>
          <CardDescription>
            Forecast cache is empty. Run <code className="text-xs">/api/cron/forecast</code> to generate.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const date = rows[0].forecastDate;
  const totalUnits = rows.reduce((s, r) => s + r.predictedUnits, 0);
  const holiday = rows.find((r) => r.holidayLabel)?.holidayLabel ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" /> Tomorrow&apos;s production plan
            </CardTitle>
            <CardDescription className="mt-1">
              {dayLabel(date)} · {totalUnits} units across {rows.length} products
              {holiday ? <span className="ml-1 font-medium text-foreground">· {holiday}</span> : null}
            </CardDescription>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            tier 1 · holt-winters
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2.5">
        {rows.map((r) => {
          const trendUp = r.trendPct >= 0;
          const dowChange = (r.dowFactor - 1) * 100;
          // The strongest single driver to surface — saves space vs. listing every multiplier.
          const driverChips: string[] = [];
          if (r.holidayLabel) driverChips.push(r.holidayLabel);
          if (Math.abs(dowChange) >= 8) driverChips.push(`${dowChange > 0 ? "+" : ""}${dowChange.toFixed(0)}% dow`);
          if (Math.abs(r.trendPct) >= 1.5) driverChips.push(`${r.trendPct > 0 ? "+" : ""}${r.trendPct.toFixed(1)}%/d trend`);
          return (
            <div key={r.productId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.productName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>{r.category}</span>
                  {driverChips.length > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{driverChips.join(" · ")}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                  {r.lowerBound ?? "—"}–{r.upperBound ?? "—"}
                </div>
                <div className="text-base font-semibold tabular-nums w-10 text-right">
                  {r.predictedUnits}
                </div>
                <div className={cn("size-4", trendUp ? "text-success" : "text-muted-foreground")}>
                  {trendUp ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
