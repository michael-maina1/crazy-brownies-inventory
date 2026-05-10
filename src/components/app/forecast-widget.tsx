import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat } from "lucide-react";
import type { TomorrowForecastRow } from "@/db/queries/forecasts";

const dayLabel = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-AE", { weekday: "long", day: "numeric", month: "long" });
};

const cleanHoliday = (label: string | null) =>
  label ? label.replace(/\s*\(UAE\)$/, "") : null;

/**
 * Convert the forecast drivers into a kitchen-friendly sentence. No
 * percentages — operators don't want to do math. Reads as: "Busy Friday ·
 * Mother's Day weekend · trending up". Empty if no driver is significant.
 */
function plainEnglishDriver(r: TomorrowForecastRow): string {
  const day = new Date(r.forecastDate + "T00:00:00Z").toLocaleDateString("en-AE", {
    weekday: "long",
  });
  const parts: string[] = [];
  if (r.dowFactor >= 1.15) parts.push(`Busy ${day}`);
  else if (r.dowFactor <= 0.85) parts.push(`Quiet ${day}`);
  else parts.push(day);

  const holiday = cleanHoliday(r.holidayLabel);
  if (holiday) parts.push(`${holiday} weekend`);

  if (r.trendPct >= 2) parts.push("trending up");
  else if (r.trendPct <= -2) parts.push("trending down");

  return parts.join(" · ");
}

export function ForecastWidget({ rows }: { rows: TomorrowForecastRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChefHat className="size-4 text-brand" /> Tomorrow&apos;s production plan
          </CardTitle>
          <CardDescription>
            Forecast cache is empty. Run <code className="text-xs">/api/cron/forecast</code> to populate.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const date = rows[0].forecastDate;
  const totalUnits = rows.reduce((s, r) => s + r.predictedUnits, 0);
  const holiday = cleanHoliday(rows.find((r) => r.holidayLabel)?.holidayLabel ?? null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ChefHat className="size-4 text-brand" /> Tomorrow&apos;s production plan
            </CardTitle>
            <CardDescription className="mt-1">
              {dayLabel(date)} · bake {totalUnits} units total
              {holiday ? <span className="ml-1 font-medium text-foreground">· {holiday} weekend</span> : null}
            </CardDescription>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:block">
            tier 1 · holt-winters
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 divide-y">
        {rows.map((r) => {
          const showRange =
            r.lowerBound != null &&
            r.upperBound != null &&
            r.upperBound - r.lowerBound >= Math.max(4, r.predictedUnits * 0.25);
          return (
            <div key={r.productId} className="flex items-start gap-4 py-3 first:pt-0">
              <div className="shrink-0 text-right w-14">
                <div className="text-2xl font-bold tabular-nums leading-none text-brand">
                  {r.predictedUnits}
                </div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wide mt-1">
                  to bake
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="font-medium text-sm">{r.productName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{plainEnglishDriver(r)}</div>
                {showRange ? (
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
                    likely between {r.lowerBound} (slow day) and {r.upperBound} (busy day)
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
