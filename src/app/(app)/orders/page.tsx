import { getOrders, getActiveProducts } from "@/db/queries/orders";
import { ChannelBadge } from "@/components/app/status-badge";
import { RecordSaleDialog } from "@/components/app/record-sale-dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAED, formatRelative } from "@/lib/format";

export default async function OrdersPage() {
  const [recent, products] = await Promise.all([getOrders(50), getActiveProducts()]);

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recording a sale auto-deducts ingredients from inventory in one transaction.
          </p>
        </div>
        <RecordSaleDialog products={products} />
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 w-[160px]">When</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right pr-4">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">
                    {formatRelative(o.createdAt)}
                  </TableCell>
                  <TableCell className="max-w-[480px]">
                    <div className="truncate font-medium">{o.productsLabel || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {o.items} line item{o.items === 1 ? "" : "s"}
                      {o.customerNote ? ` · ${o.customerNote}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChannelBadge channel={o.channel} />
                  </TableCell>
                  <TableCell className="text-right pr-4 font-semibold tabular-nums">
                    {formatAED(o.totalFils)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
