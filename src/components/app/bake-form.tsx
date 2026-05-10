"use client";

import { useActionState, useMemo, useState } from "react";
import { startBakeAction } from "@/app/(app)/production/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChefHat } from "lucide-react";
import { toast } from "sonner";
import { formatAED } from "@/lib/format";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  category: string;
  freshnessHours: number | null;
  defaultBatchSize: number | null;
  unitCostFils: number;
  pricePerUnitFils: number;
  predictedUnits: number | null;
};

export function BakeForm({
  products,
  defaultProductId,
  defaultQty,
}: {
  products: ProductOption[];
  defaultProductId?: string;
  defaultQty?: number;
}) {
  const [productId, setProductId] = useState<string>(defaultProductId ?? products[0]?.id ?? "");
  const selected = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);

  const initialQty =
    defaultQty?.toString() ??
    (selected?.predictedUnits?.toString() ?? selected?.defaultBatchSize?.toString() ?? "12");
  const [quantity, setQuantity] = useState<string>(initialQty);

  const qtyNum = Math.max(0, parseInt(quantity, 10) || 0);
  const totalCostFils = (selected?.unitCostFils ?? 0) * qtyNum;
  const totalRevFils = (selected?.pricePerUnitFils ?? 0) * qtyNum;
  const grossProfitFils = totalRevFils - totalCostFils;

  const [state, action, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await startBakeAction(prev, formData);
    if (result && "error" in result) toast.error(result.error);
    return result;
  }, null);

  const onPickProduct = (id: string) => {
    setProductId(id);
    const next = products.find((p) => p.id === id);
    if (next) setQuantity((next.predictedUnits ?? next.defaultBatchSize ?? 12).toString());
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />

      <div className="space-y-2">
        <Label>Product</Label>
        <Select value={productId} onValueChange={(v) => v && onPickProduct(v as string)}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a product…" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                <span className="text-muted-foreground"> · {p.sku}</span>
                {p.predictedUnits != null ? (
                  <span className="text-muted-foreground"> · forecast {p.predictedUnits}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity (units)</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Best by</Label>
          <div className="h-10 px-3 flex items-center text-sm rounded-md border border-input bg-muted/30 tabular-nums">
            {selected?.freshnessHours ? `${selected.freshnessHours}h after bake` : "—"}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">
          Note <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Textarea id="note" name="note" rows={2} placeholder="Tray colour, oven number, special order…" />
      </div>

      {selected ? (
        <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ingredient cost</div>
            <div className="mt-0.5 font-semibold tabular-nums">{formatAED(totalCostFils)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Revenue at full sell-through</div>
            <div className="mt-0.5 font-semibold tabular-nums">{formatAED(totalRevFils)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross profit</div>
            <div className="mt-0.5 font-semibold tabular-nums text-[color:var(--success)]">
              {formatAED(grossProfitFils)}
            </div>
          </div>
        </div>
      ) : null}

      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-end pt-1">
        <Button type="submit" disabled={pending || !productId || qtyNum <= 0}>
          <ChefHat className="size-4 mr-1.5" />
          {pending ? "Starting bake…" : "Start bake & print labels"}
        </Button>
      </div>
    </form>
  );
}
