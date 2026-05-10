import { getActiveBatches, getTodaysBakes } from "@/db/queries/production";
import { getTomorrowForecast } from "@/db/queries/forecasts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FreshnessBadge } from "@/components/app/status-badge";
import { ChefHat, Sparkles, Package } from "lucide-react";
import Link from "next/link";
import { formatAED, formatRelative } from "@/lib/format";
import { freshnessOf } from "@/db/queries/batches";

export default async function ProductionPage() {
  const [forecast, todaysBakes, active] = await Promise.all([
    getTomorrowForecast(8),
    getTodaysBakes(),
    getActiveBatches(50),
  ]);

  const totalActiveUnits = active.reduce((s, b) => s + b.quantityRemaining, 0);
  const totalActiveValueFils = active.reduce((s, b) => {
    const remainingShare = b.quantityBaked > 0 ? b.quantityRemaining / b.quantityBaked : 0;
    return s + Math.round(b.costAtBakeFils * remainingShare);
  }, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ChefHat className="size-5" /> Production
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tomorrow&apos;s plan, today&apos;s bakes, and what&apos;s ready on the shelf.
          </p>
        </div>
        <Link href="/production/bake/new">
          <Button>
            <ChefHat className="size-4 mr-1.5" /> Start a bake
          </Button>
        </Link>
      </header>

      {/* ── KPI strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiTile label="Planned tomorrow" value={`${forecast.reduce((s, f) => s + f.predictedUnits, 0)} units`} hint={`${forecast.length} products`} />
        <KpiTile label="Baked today" value={`${todaysBakes.reduce((s, b) => s + b.quantityBaked, 0)} units`} hint={`${todaysBakes.length} batch${todaysBakes.length === 1 ? "" : "es"}`} />
        <KpiTile label="On the shelf" value={`${totalActiveUnits} units`} hint={`${active.length} active batch${active.length === 1 ? "" : "es"}`} />
        <KpiTile label="Inventory value at cost" value={formatAED(totalActiveValueFils)} hint="Snapshot at bake time" />
      </div>

      {/* ── Tomorrow's plan ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" /> Tomorrow&apos;s plan
            </CardTitle>
            <CardDescription>
              Pre-filled from the AI forecast. Tap a row to start the bake with the predicted quantity.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {forecast.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Forecast cache is empty. Trigger <code className="text-xs">/api/cron/forecast</code>.
            </p>
          ) : (
            <ul className="divide-y">
              {forecast.map((f) => (
                <li key={f.productId} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{f.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.category}
                      {f.holidayLabel ? <span className="ml-1.5 text-foreground font-medium">· {f.holidayLabel}</span> : null}
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <div className="text-sm font-semibold">{f.predictedUnits} units</div>
                    <div className="text-[11px] text-muted-foreground">
                      {f.lowerBound}–{f.upperBound}
                    </div>
                  </div>
                  <Link href={`/production/bake/new?product=${f.productId}&qty=${f.predictedUnits}`}>
                    <Button size="sm" variant="outline">
                      Start bake
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Two-up: Today's bakes + On-the-shelf ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-4" /> Baked today
            </CardTitle>
            <CardDescription>Most recent bakes first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {todaysBakes.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No bakes yet today.</p>
            ) : (
              <ul className="divide-y">
                {todaysBakes.map((b) => (
                  <li key={b.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.productName}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        <code className="text-[10px]">{b.batchCode}</code> · {formatRelative(b.bakedAt)}
                      </div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-sm font-semibold">
                        {b.quantityRemaining}/{b.quantityBaked}
                      </div>
                      <div className="text-[11px] text-muted-foreground">remaining</div>
                    </div>
                    <Link href={`/labels/${b.id}?qty=${b.quantityBaked}`}>
                      <Button size="sm" variant="ghost">
                        Reprint
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-4" /> On the shelf
            </CardTitle>
            <CardDescription>Active batches across all bakes — oldest expiry first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {active.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nothing active right now.</p>
            ) : (
              <ul className="divide-y">
                {active.map((b) => {
                  const fresh = freshnessOf(b.expiresAt, null);
                  return (
                    <li key={b.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{b.productName}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          <code className="text-[10px]">{b.batchCode}</code> · {b.hoursToExpiry}h to expiry
                        </div>
                      </div>
                      <div className="text-right tabular-nums shrink-0">
                        <div className="text-sm font-semibold">{b.quantityRemaining} units</div>
                      </div>
                      <FreshnessBadge state={fresh} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
