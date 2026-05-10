import { db } from "@/db/client";
import { products, recipes, ingredients } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTomorrowForecast } from "@/db/queries/forecasts";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";
import { BakeForm } from "@/components/app/bake-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewBakePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; qty?: string }>;
}) {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Only managers and owners can start bakes.
        </p>
      </div>
    );
  }

  const { product, qty } = await searchParams;

  // Pull active products with computed unit cost from recipes × current ingredient cost,
  // joined to tomorrow's forecast for pre-fill suggestions.
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      freshnessHours: products.freshnessHours,
      defaultBatchSize: products.defaultBatchSize,
      pricePerUnitFils: products.priceFils,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(products.category, products.name);

  // Per-product unit cost: sum(recipe qty × ingredient cost-per-unit), rounded to fils.
  const costRows = await db.execute<{ product_id: string; unit_cost_fils: string }>(sql`
    select r.product_id::text as product_id,
           coalesce(sum(r.quantity_per_unit * i.cost_per_unit_fils), 0)::text as unit_cost_fils
    from recipes r
    join ingredients i on i.id = r.ingredient_id
    group by r.product_id
  `);
  const costByProduct = new Map(costRows.map((r) => [r.product_id, Math.round(Number(r.unit_cost_fils))]));

  const tomorrow = await getTomorrowForecast(50);
  const forecastByProduct = new Map(tomorrow.map((f) => [f.productId, f.predictedUnits]));

  const productOptions = productRows.map((p) => ({
    ...p,
    unitCostFils: costByProduct.get(p.id) ?? 0,
    predictedUnits: forecastByProduct.get(p.id) ?? null,
  }));

  return (
    <div className="p-6 space-y-5 max-w-[900px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Start a bake</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a product and quantity. Ingredients debit live, a product batch is created with a
          best-by date, and labels print on the next screen.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New bake</CardTitle>
          <CardDescription>
            Quantities pre-fill from tomorrow&apos;s forecast where available, falling back to each
            product&apos;s default batch size.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BakeForm
            products={productOptions}
            defaultProductId={product}
            defaultQty={qty ? parseInt(qty, 10) || undefined : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
