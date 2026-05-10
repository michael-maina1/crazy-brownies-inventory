import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import type { ForecastMatrix } from "@/db/queries/forecasts";
import { cn } from "@/lib/utils";

/**
 * Heat-shade a cell relative to the largest single-cell value in the matrix.
 * Brand color, low opacity ramp — readable in any room.
 */
function cellBg(value: number, max: number): string {
  if (value === 0 || max === 0) return "";
  const ratio = value / max;
  if (ratio > 0.85) return "bg-brand/25";
  if (ratio > 0.6) return "bg-brand/15";
  if (ratio > 0.35) return "bg-brand/10";
  if (ratio > 0.15) return "bg-brand/5";
  return "";
}

export function ForecastMatrixCard({ matrix }: { matrix: ForecastMatrix }) {
  if (matrix.rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-brand" /> Bake plan · next 7 days
          </CardTitle>
          <CardDescription>Forecast cache is empty.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Find the heaviest day for the "peak day" badge in the description.
  const peakDate = matrix.dates.reduce((peak, d) =>
    matrix.totalsByDate[d.iso] > matrix.totalsByDate[peak.iso] ? d : peak,
    matrix.dates[0],
  );
  const peakName = new Date(peakDate.iso + "T00:00:00Z").toLocaleDateString("en-AE", {
    weekday: "long",
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand" /> Bake plan · next 7 days
        </CardTitle>
        <CardDescription>
          {matrix.weekTotal} units across {matrix.rows.length} products. Peak day:{" "}
          <span className="font-medium text-foreground">{peakName}</span> ({matrix.totalsByDate[peakDate.iso]} units).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium pl-5 pr-3 py-2 sticky left-0 bg-card">Product</th>
              {matrix.dates.map((d) => (
                <th
                  key={d.iso}
                  className={cn(
                    "text-center font-medium px-2 py-2 min-w-[52px]",
                    d.isWeekend && "text-foreground",
                  )}
                >
                  <div>{d.weekday}</div>
                  <div className="font-normal text-muted-foreground tabular-nums">{d.dayOfMonth}</div>
                </th>
              ))}
              <th className="text-right font-medium pl-3 pr-5 py-2 min-w-[72px]">7-day total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((p) => (
              <tr key={p.productId} className="border-t">
                <td className="pl-5 pr-3 py-2 font-medium text-sm sticky left-0 bg-card">
                  <div className="truncate max-w-[220px]">{p.productName}</div>
                  <div className="text-[11px] text-muted-foreground">{p.category}</div>
                </td>
                {matrix.dates.map((d) => {
                  const v = p.byDate[d.iso] ?? 0;
                  return (
                    <td
                      key={d.iso}
                      className={cn(
                        "text-center px-2 py-2 tabular-nums",
                        cellBg(v, matrix.globalMax),
                      )}
                    >
                      {v > 0 ? `Bake ${v}` : <span className="text-muted-foreground/50">—</span>}
                    </td>
                  );
                })}
                <td className="text-right pl-3 pr-5 py-2 font-semibold tabular-nums">{p.weekTotal}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="pl-5 pr-3 py-2 text-sm sticky left-0 bg-muted/30">All products</td>
              {matrix.dates.map((d) => (
                <td key={d.iso} className="text-center px-2 py-2 tabular-nums">
                  {matrix.totalsByDate[d.iso]}
                </td>
              ))}
              <td className="text-right pl-3 pr-5 py-2 tabular-nums">{matrix.weekTotal}</td>
            </tr>
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-muted-foreground border-t">
          Read each row left to right: that product&apos;s suggested bake count for each of the next
          seven days. Darker cells are heavier days.
        </p>
      </CardContent>
    </Card>
  );
}
