import { getIngredientsWithSuppliers } from "@/db/queries/inventory";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";
import { StockStatusBadge } from "@/components/app/status-badge";
import { AdjustStockDialog } from "@/components/app/adjust-stock-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAED, formatQuantity, stockStatus } from "@/lib/format";
import { Pencil } from "lucide-react";

export default async function InventoryPage() {
  const profile = await requireProfile();
  const canEdit = isManagerOrOwner(profile.role);
  const items = await getIngredientsWithSuppliers();

  const summary = {
    out: items.filter((i) => stockStatus(i.currentStock, i.reorderThreshold) === "out").length,
    critical: items.filter((i) => stockStatus(i.currentStock, i.reorderThreshold) === "critical").length,
    low: items.filter((i) => stockStatus(i.currentStock, i.reorderThreshold) === "low").length,
    healthy: items.filter((i) => stockStatus(i.currentStock, i.reorderThreshold) === "healthy").length,
  };

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} ingredients · {summary.out} out · {summary.critical} critical · {summary.low} low · {summary.healthy} healthy
          </p>
        </div>
        {!canEdit ? (
          <span className="text-xs text-muted-foreground">View-only as {profile.role}</span>
        ) : null}
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">All ingredients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Ingredient</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right pr-4">Cost / unit</TableHead>
                {canEdit ? <TableHead className="w-12 pr-4" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const status = stockStatus(i.currentStock, i.reorderThreshold);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="pl-4 font-medium">{i.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(i.currentStock, i.unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatQuantity(i.reorderThreshold, i.unit)}
                    </TableCell>
                    <TableCell>
                      <StockStatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {i.supplierName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground pr-4">
                      {formatAED(Math.round(Number(i.costPerUnitFils) * 100), { precise: true })}
                      <span className="text-xs text-muted-foreground/70">
                        {" "}/ {i.unit === "ea" ? "unit" : i.unit}
                      </span>
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="pr-4">
                        <AdjustStockDialog
                          ingredientId={i.id}
                          ingredientName={i.name}
                          unit={i.unit}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Adjust stock">
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
