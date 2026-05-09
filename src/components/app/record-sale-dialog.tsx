"use client";

import { useState, useTransition } from "react";
import { recordSale } from "@/app/(app)/orders/actions";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { formatAED } from "@/lib/format";
import { toast } from "sonner";

type Product = { id: string; name: string; category: string; priceFils: number };
type Channel = "in_store" | "website" | "deliveroo" | "corporate";
type Line = { productId: string; quantity: number };

export function RecordSaleDialog({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("in_store");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: products[0]?.id ?? "", quantity: 1 }]);
  const [pending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.id, p]));
  const total = lines.reduce(
    (s, l) => s + (productById.get(l.productId)?.priceFils ?? 0) * l.quantity,
    0,
  );

  function reset() {
    setLines([{ productId: products[0]?.id ?? "", quantity: 1 }]);
    setChannel("in_store");
    setNote("");
  }

  function submit() {
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one product to the sale.");
      return;
    }
    startTransition(async () => {
      const result = await recordSale({
        channel,
        customerNote: note || undefined,
        lines: validLines,
      });
      if (result && "ok" in result) {
        toast.success("Sale recorded", {
          description: `${formatAED(total)} · ${validLines.length} line item${validLines.length > 1 ? "s" : ""}. Inventory updated.`,
        });
        reset();
        setOpen(false);
      } else if (result && "error" in result) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <ShoppingCart className="size-4 mr-1.5" />
            Record sale
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a sale</DialogTitle>
          <DialogDescription>
            Inventory will auto-deduct based on each product&apos;s recipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => v && setChannel(v as Channel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_store">In-Store</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="deliveroo">Deliveroo</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((cur) => [...cur, { productId: products[0]?.id ?? "", quantity: 1 }])}
              >
                <Plus className="size-3.5 mr-1" /> Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const p = productById.get(line.productId);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={line.productId}
                      onValueChange={(v) =>
                        setLines((cur) =>
                          cur.map((l, i) => (i === idx ? { ...l, productId: (v as string) ?? l.productId } : l)),
                        )
                      }
                    >
                      <SelectTrigger className="flex-1 min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.name} <span className="text-muted-foreground">· {formatAED(opt.priceFils)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((cur) =>
                          cur.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value) || 1 } : l)),
                        )
                      }
                      className="h-9 w-16 rounded-md border border-input bg-transparent px-2 text-sm tabular-nums"
                    />
                    <div className="w-20 text-right text-sm tabular-nums text-muted-foreground">
                      {formatAED((p?.priceFils ?? 0) * line.quantity)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((cur) => cur.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Customer message, gift recipient, etc." />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums">{formatAED(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || total === 0}>
            {pending ? "Recording…" : "Record sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
