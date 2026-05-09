"use client";

import { useActionState, useState } from "react";
import { adjustStock } from "@/app/(app)/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function AdjustStockDialog({
  ingredientId,
  ingredientName,
  unit,
  trigger,
}: {
  ingredientId: string;
  ingredientName: string;
  unit: "g" | "ml" | "ea";
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"restock" | "waste" | "adjustment" | "recount">("restock");
  const [state, action, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await adjustStock(prev, formData);
    if (result && "ok" in result) {
      toast.success("Stock updated", { description: ingredientName });
      setOpen(false);
    } else if (result && "error" in result) {
      toast.error(result.error);
    }
    return result;
  }, null);

  const isDeduction = reason === "waste";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>{ingredientName}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="ingredientId" value={ingredientId} />

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select name="reason" value={reason} onValueChange={(v) => v && setReason(v as typeof reason)}>
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restock">Restock — received from supplier</SelectItem>
                <SelectItem value="waste">Waste — discard / expired</SelectItem>
                <SelectItem value="adjustment">Adjustment — manual correction</SelectItem>
                <SelectItem value="recount">Recount — physical count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delta">
              Quantity ({unit === "ea" ? "units" : unit})
              <span className="text-muted-foreground text-xs ml-1">
                {isDeduction ? "(enter as negative, e.g. -200)" : "(positive for additions)"}
              </span>
            </Label>
            <Input
              id="delta"
              name="delta"
              type="number"
              step="any"
              required
              defaultValue={isDeduction ? "-100" : "1000"}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea id="note" name="note" rows={2} placeholder="Invoice #, batch ID, who counted, etc." />
          </div>

          {state && "error" in state ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save movement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
