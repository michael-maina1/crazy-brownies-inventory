import { getProductsWithRecipes } from "@/db/queries/products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAED, formatQuantity } from "@/lib/format";
import { TrendingUp, Sparkles, Package } from "lucide-react";

const HERO_BADGES: Record<string, { label: string; tone: "brand" | "muted" }> = {
  "Viral Pistachio Kunafa Bar (Milk)": { label: "Bestseller", tone: "brand" },
  "Bueno Bar": { label: "Bestseller", tone: "brand" },
  "Salted Lotus Kunefe Bar": { label: "New", tone: "brand" },
};

export default async function ProductsPage() {
  const all = await getProductsWithRecipes();
  const categories = Array.from(new Set(all.map((p) => p.category)));

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products & Recipes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {all.length} SKUs across {categories.length} categories. Recipes drive auto-deduction on every sale.
          </p>
        </div>
      </header>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          {categories.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c} ({all.filter((p) => p.category === c).length})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-5">
          <ProductGrid products={all} />
        </TabsContent>
        {categories.map((c) => (
          <TabsContent key={c} value={c} className="mt-5">
            <ProductGrid products={all.filter((p) => p.category === c)} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ProductGrid({ products }: { products: Awaited<ReturnType<typeof getProductsWithRecipes>> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {products.map((p) => {
        const badge = HERO_BADGES[p.name];
        return (
          <Card key={p.id}>
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{p.name}</CardTitle>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{p.sku}</code>
                    <span>·</span>
                    <span>{p.category}</span>
                  </div>
                </div>
                {badge ? (
                  <Badge
                    variant={badge.tone === "brand" ? "default" : "secondary"}
                    className={badge.tone === "brand" ? "bg-brand text-brand-foreground hover:bg-brand/90" : ""}
                  >
                    {badge.label === "Bestseller" ? <TrendingUp className="size-3 mr-1" /> : <Sparkles className="size-3 mr-1" />}
                    {badge.label}
                  </Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <Stat label="Price" value={formatAED(p.priceFils)} />
                <Stat label="Cost" value={formatAED(p.costFils)} muted />
                <Stat
                  label="Margin"
                  value={`${p.marginPct.toFixed(0)}%`}
                  tone={p.marginPct >= 60 ? "good" : p.marginPct >= 40 ? "default" : "warning"}
                />
              </div>
              <ReadyStockLine
                unitsRemaining={p.unitsRemaining}
                batchCount={p.batchCount}
                earliestExpiresAt={p.earliestExpiresAt}
                freshnessHours={p.freshnessHours}
              />
              {p.description ? (
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{p.description}</p>
              ) : null}
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Recipe — {p.recipe.length} ingredients
              </div>
              <ul className="space-y-1.5">
                {p.recipe.map((line) => (
                  <li key={line.ingredientId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-foreground/90">{line.ingredientName}</span>
                    <span className="tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                      {formatQuantity(line.quantityPerUnit, line.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
  tone = "default",
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "default" | "good" | "warning";
}) {
  const toneClass =
    tone === "good" ? "text-[color:var(--success)]" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div>
      <div className="text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${muted ? "text-muted-foreground" : toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function ReadyStockLine({
  unitsRemaining,
  batchCount,
  earliestExpiresAt,
  freshnessHours,
}: {
  unitsRemaining: number;
  batchCount: number;
  earliestExpiresAt: Date | null;
  freshnessHours: number | null;
}) {
  const hasStock = unitsRemaining > 0;
  const tone =
    !hasStock ? "text-muted-foreground" : "text-foreground";
  const dateLabel = earliestExpiresAt
    ? earliestExpiresAt.toLocaleDateString("en-AE", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs">
      <Package className={`size-3.5 shrink-0 ${tone}`} />
      <div className={`flex-1 min-w-0 ${tone} tabular-nums`}>
        {hasStock ? (
          <>
            <span className="font-semibold">Ready: {unitsRemaining} unit{unitsRemaining === 1 ? "" : "s"}</span>
            <span className="text-muted-foreground">
              {" "}across {batchCount} batch{batchCount === 1 ? "" : "es"}
              {dateLabel ? ` · best by ${dateLabel}` : ""}
            </span>
          </>
        ) : (
          <span>
            No active batches
            {freshnessHours ? <span className="text-muted-foreground"> · {freshnessHours}h shelf</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}
