"use client";

import { useActionState, useMemo, useState } from "react";
import { recordDelivery } from "@/app/(app)/inventory/receive/actions";
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
import { toast } from "sonner";
import { Truck } from "lucide-react";

type IngredientOption = {
  id: string;
  name: string;
  unit: "g" | "ml" | "ea";
  shelfLifeDays: number | null;
  supplierId: string | null;
  costPerUnitFils: string;
};

type SupplierOption = { id: string; name: string };

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function ReceiveDeliveryForm({
  ingredients,
  suppliers,
}: {
  ingredients: IngredientOption[];
  suppliers: SupplierOption[];
}) {
  const [ingredientId, setIngredientId] = useState<string>(ingredients[0]?.id ?? "");
  const selected = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId],
  );

  const [supplierId, setSupplierId] = useState<string>(selected?.supplierId ?? "");
  const [quantity, setQuantity] = useState<string>("1000");
  const [costAed, setCostAed] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>(
    selected?.shelfLifeDays ? addDays(selected.shelfLifeDays) : "",
  );
  const [batchCode, setBatchCode] = useState<string>("");

  const [state, action, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await recordDelivery(prev, formData);
    if (result && "ok" in result) {
      toast.success("Delivery recorded", {
        description: selected ? `${quantity} ${selected.unit === "ea" ? "units" : selected.unit} of ${selected.name}` : "Batch saved",
      });
      // Reset some fields, keep ingredient + supplier for batch entry workflow.
      setQuantity("1000");
      setCostAed("");
      setBatchCode("");
    } else if (result && "error" in result) {
      toast.error(result.error);
    }
    return result;
  }, null);

  // Auto-populate expiry / supplier when the user changes ingredient.
  const onIngredientChange = (value: string) => {
    setIngredientId(value);
    const next = ingredients.find((i) => i.id === value);
    if (!next) return;
    if (next.shelfLifeDays) setExpiresAt(addDays(next.shelfLifeDays));
    if (next.supplierId) setSupplierId(next.supplierId);
  };

  const unitLabel = selected?.unit === "ea" ? "units" : selected?.unit ?? "";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ingredientId" value={ingredientId} />
      <input type="hidden" name="supplierId" value={supplierId} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Ingredient</Label>
          <Select value={ingredientId} onValueChange={(v) => v && onIngredientChange(v as string)}>
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {ingredients.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={(v) => setSupplierId((v as string) ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier…" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity {unitLabel ? <span className="text-muted-foreground text-xs">({unitLabel})</span> : null}</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="costAed">Total cost (AED)</Label>
          <Input
            id="costAed"
            name="costAed"
            type="number"
            min={0}
            step="0.01"
            value={costAed}
            onChange={(e) => setCostAed(e.target.value)}
            placeholder="from invoice"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiresAt">Expires</Label>
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="batchCode">
          Batch code <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="batchCode"
          name="batchCode"
          value={batchCode}
          onChange={(e) => setBatchCode(e.target.value)}
          placeholder="e.g. CB-2026-05-A"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea id="note" name="note" rows={2} placeholder="Invoice ref, driver name, condition…" />
      </div>

      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-end pt-2">
        <Button type="submit" disabled={pending || !ingredientId}>
          <Truck className="size-4 mr-1.5" />
          {pending ? "Saving…" : "Record delivery"}
        </Button>
      </div>
    </form>
  );
}
