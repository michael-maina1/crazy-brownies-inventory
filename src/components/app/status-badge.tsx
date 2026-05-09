import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/format";

const STYLES: Record<StockStatus, string> = {
  out:      "bg-destructive/10 text-destructive ring-destructive/20",
  critical: "bg-destructive/10 text-destructive ring-destructive/20",
  low:      "bg-warning/15 text-warning ring-warning/25",
  healthy:  "bg-success/15 text-[color:var(--success)] ring-success/25",
};

const LABELS: Record<StockStatus, string> = {
  out:      "Out",
  critical: "Critical",
  low:      "Low",
  healthy:  "Healthy",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STYLES[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  in_store: "In-Store",
  website: "Website",
  deliveroo: "Deliveroo",
  corporate: "Corporate",
};

export function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}
