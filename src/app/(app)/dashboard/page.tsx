import {
  getRevenueLast30Days,
  getOrdersToday,
  getLowStockSummary,
  getDailyRevenueSeries,
  getTopProducts,
  getRecentOrders,
  getWastePercent,
} from "@/db/queries/dashboard";
import { getExpiringSoonSummary, getExpiringSoonBatches } from "@/db/queries/batches";
import { getTomorrowForecast } from "@/db/queries/forecasts";
import { KPICard } from "@/components/app/kpi-card";
import { StockStatusBadge, ChannelBadge, FreshnessBadge } from "@/components/app/status-badge";
import { SalesChart } from "@/components/app/sales-chart";
import { ForecastWidget } from "@/components/app/forecast-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAED, formatAEDCompact, formatQuantity, formatRelative, stockStatus } from "@/lib/format";
import { CircleDollarSign, AlertTriangle, Recycle, Clock4 } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const [today, last30, lowStock, series, top, recent, wastePct, atRisk, expiring, forecast] =
    await Promise.all([
      getOrdersToday(),
      getRevenueLast30Days(),
      getLowStockSummary(),
      getDailyRevenueSeries(30),
      getTopProducts(30, 5),
      getRecentOrders(8),
      getWastePercent(30),
      getExpiringSoonSummary(7),
      getExpiringSoonBatches(7, 6),
      getTomorrowForecast(8),
    ]);

  const outCount = lowStock.filter((i) => Number(i.currentStock) <= 0).length;
  const criticalCount = lowStock.filter((i) => {
    const s = Number(i.currentStock);
    const t = Number(i.reorderThreshold);
    return s > 0 && s < t * 0.5;
  }).length;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sales, stock, freshness, and what needs your attention right now.
          </p>
        </div>
        <div className="text-xs text-muted-foreground hidden sm:block">
          Last 30 days · Al Quoz, Dubai
        </div>
      </header>

      {/* ── Section 1 · At a glance ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Revenue today"
          value={formatAED(today.revenueFils)}
          hint={`${today.orderCount} orders so far`}
          icon={CircleDollarSign}
          tone="brand"
        />
        <KPICard
          label="Revenue · 30d"
          value={formatAEDCompact(last30.revenueFils)}
          hint={`${last30.orderCount} orders`}
          icon={CircleDollarSign}
        />
        <KPICard
          label="Low-stock items"
          value={lowStock.length.toString()}
          hint={`${outCount} out · ${criticalCount} critical`}
          icon={AlertTriangle}
          tone={outCount + criticalCount > 0 ? "destructive" : "default"}
        />
        <KPICard
          label="At risk · 7d"
          value={formatAED(atRisk.aedAtRiskFils)}
          hint={`${atRisk.batches} batch${atRisk.batches === 1 ? "" : "es"} expiring`}
          icon={Clock4}
          tone={atRisk.aedAtRiskFils > 0 ? "warning" : "default"}
        />
        <KPICard
          label="Waste · 30d"
          value={`${wastePct.toFixed(2)}%`}
          hint="of total ingredient usage"
          icon={Recycle}
          tone={wastePct > 1 ? "warning" : "default"}
        />
      </div>

      {/* ── Section 2 · Tomorrow's plan + reorder list ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ForecastWidget rows={forecast} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Needs reorder</CardTitle>
              <CardDescription>Below threshold right now</CardDescription>
            </div>
            <Link href="/inventory" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All ingredients above their reorder thresholds.</p>
            ) : (
              lowStock.slice(0, 7).map((i) => {
                const s = stockStatus(i.currentStock, i.reorderThreshold);
                return (
                  <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatQuantity(i.currentStock, i.unit)} · reorder at {formatQuantity(i.reorderThreshold, i.unit)}
                      </div>
                    </div>
                    <StockStatusBadge status={s} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3 · Daily revenue + Expiring batches ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily revenue</CardTitle>
            <CardDescription>Last 30 days across all channels</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Expiring this week</CardTitle>
              <CardDescription>FIFO list · oldest first</CardDescription>
            </div>
            <Link href="/inventory/receive" className="text-xs text-muted-foreground hover:text-foreground">Receive →</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing expires in the next seven days.</p>
            ) : (
              expiring.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.ingredientName}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatQuantity(b.quantityRemaining, b.unit)} ·{" "}
                      {b.expiresAt
                        ? new Date(b.expiresAt).toLocaleDateString("en-AE", { day: "numeric", month: "short" })
                        : "—"}{" "}
                      · {formatAED(b.aedAtRiskFils)}
                    </div>
                  </div>
                  <FreshnessBadge state={b.freshness} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4 · Top products + Recent orders ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top products · 30 days</CardTitle>
            <CardDescription>By revenue contribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {top.map((p, idx) => (
                <li key={p.productId} className="flex items-center gap-3">
                  <div className="size-7 rounded-md bg-muted text-xs font-semibold tabular-nums flex items-center justify-center text-muted-foreground">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category} · {p.units} units</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{formatAED(p.revenueFils)}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Live order feed</CardDescription>
            </div>
            <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {o.firstProduct ?? "—"}
                    {o.items > 1 ? <span className="text-muted-foreground font-normal"> + {o.items - 1} more</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <ChannelBadge channel={o.channel} />
                    {formatRelative(o.createdAt)}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{formatAED(o.totalFils)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
