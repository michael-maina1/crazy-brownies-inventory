import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KPICard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "brand" | "warning" | "destructive";
}) {
  const toneClass = {
    default: "text-foreground",
    brand: "text-brand",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", toneClass)}>
              {value}
            </div>
            {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
          </div>
          {Icon ? (
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <Icon className="size-4" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
