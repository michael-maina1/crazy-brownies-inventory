"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { sendTestAlert } from "@/app/(app)/alerts/actions";

type AddAction = (prev: unknown, formData: FormData) => Promise<{ ok: true } | { error: string } | null>;

export function AddSubscriptionForm({ action }: { action: AddAction }) {
  const [state, run, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await action(prev, formData);
    if (result && "ok" in result) {
      toast.success("Subscriber added");
      (document.getElementById("alert-add-form") as HTMLFormElement)?.reset();
    } else if (result && "error" in result) {
      toast.error(result.error);
    }
    return result;
  }, null);

  return (
    <form id="alert-add-form" action={run} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="ops@crazybrownies.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label">Label <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input id="label" name="label" placeholder="Kitchen lead" />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="eventLowStock" defaultChecked />
          Low-stock alerts
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="eventExpiring" defaultChecked />
          Expiring batches
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="eventDailySummary" />
          Daily summary
        </label>
      </fieldset>
      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add subscriber"}
        </Button>
      </div>
    </form>
  );
}

export function TestAlertButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendTestAlert();
          if (r && "ok" in r) {
            toast.success(
              `Dispatched · sent ${r.sent} · deduped ${r.deduped} · failed ${r.failed}`,
            );
          } else if (r && "error" in r) {
            toast.error(r.error);
          }
        })
      }
    >
      {pending ? "Sending test…" : "Send test alert to all subscribers"}
    </Button>
  );
}
