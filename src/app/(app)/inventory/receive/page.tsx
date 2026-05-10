import { getReceiveFormData, getExpiringSoonBatches } from "@/db/queries/batches";
import { requireProfile, isManagerOrOwner } from "@/lib/auth";
import { ReceiveDeliveryForm } from "@/components/app/receive-delivery-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAED, formatQuantity } from "@/lib/format";
import { FreshnessBadge } from "@/components/app/status-badge";

export default async function ReceiveDeliveryPage() {
  const profile = await requireProfile();
  if (!isManagerOrOwner(profile.role)) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Only managers and owners can record deliveries.
        </p>
      </div>
    );
  }

  const [{ ingredients, suppliers }, expiring] = await Promise.all([
    getReceiveFormData(),
    getExpiringSoonBatches(14, 8),
  ]);

  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Receive delivery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Log incoming stock as a batch. Expiry, supplier, and cost flow into the freshness dashboard.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>New batch</CardTitle>
            <CardDescription>
              Pick the ingredient — expiry pre-fills from its shelf life. Override from the invoice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReceiveDeliveryForm ingredients={ingredients} suppliers={suppliers} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Expiring soon</CardTitle>
            <CardDescription>Next 14 days · across all batches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {expiring.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batches expiring in the next two weeks.</p>
            ) : (
              expiring.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.ingredientName}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatQuantity(b.quantityRemaining, b.unit)} ·{" "}
                      {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString("en-AE", { day: "numeric", month: "short" }) : "—"}
                      {" · "}
                      {formatAED(b.aedAtRiskFils)}
                    </div>
                  </div>
                  <FreshnessBadge state={b.freshness} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
