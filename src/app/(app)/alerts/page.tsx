import { requireProfile, isManagerOrOwner } from "@/lib/auth";
import { getAlertSubscriptions, getRecentAlerts } from "@/db/queries/alerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddSubscriptionForm, TestAlertButton } from "@/components/app/alert-controls";
import { addSubscription, deleteSubscription } from "./actions";
import { Bell, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { formatRelative } from "@/lib/format";

export default async function AlertsPage() {
  const profile = await requireProfile();
  const canEdit = isManagerOrOwner(profile.role);
  const [subs, recent] = await Promise.all([getAlertSubscriptions(), getRecentAlerts(25)]);

  const usingResend = !!process.env.RESEND_API_KEY;

  return (
    <div className="p-6 space-y-5 max-w-[1100px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bell className="size-5" /> Operator alerts
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Email notifications when inventory crosses a threshold or batches are about to expire.
        </p>
      </header>

      {!usingResend ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-foreground">
              Sandbox mode — no <code className="text-xs">RESEND_API_KEY</code> configured.
            </p>
            <p className="text-muted-foreground mt-1">
              Alerts are queued to the log below but not delivered. Add the env var on Vercel and redeploy
              to start sending real emails. WhatsApp is on the Phase-2 roadmap.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Subscribers</CardTitle>
            <CardDescription>Who gets emailed when something needs attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscribers yet — add one below.</p>
            ) : (
              <ul className="divide-y border rounded-md">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.email}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.label ?? "No label"} ·{" "}
                        {[
                          s.eventLowStock ? "Low-stock" : null,
                          s.eventExpiring ? "Expiring" : null,
                          s.eventDailySummary ? "Daily" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No events selected"}
                      </div>
                    </div>
                    {canEdit ? (
                      <form action={deleteSubscription}>
                        <input type="hidden" name="id" value={s.id} />
                        <Button type="submit" variant="ghost" size="icon" aria-label="Remove subscriber">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canEdit ? (
              <div className="border-t pt-4 space-y-3">
                <AddSubscriptionForm action={addSubscription} />
                <TestAlertButton />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent alerts</CardTitle>
            <CardDescription>Last 25 dispatches.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground p-5">No alerts yet.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((a) => {
                  const Icon =
                    a.status === "sent" ? CheckCircle2 : a.status === "failed" ? AlertCircle : Clock;
                  const tone =
                    a.status === "sent"
                      ? "text-success"
                      : a.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground";
                  return (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                      <Icon className={`size-4 mt-0.5 ${tone}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{a.subject}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.recipientEmail} · {a.eventType} · {formatRelative(a.createdAt)}
                          {a.errorMessage ? <span className="text-destructive"> · {a.errorMessage}</span> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
