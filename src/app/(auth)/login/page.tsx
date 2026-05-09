"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="size-9 rounded-lg bg-brand text-brand-foreground flex items-center justify-center font-display font-semibold text-base shadow-sm">
            CB
          </div>
          <CardTitle className="font-display text-2xl tracking-tight">Crazy Brownies</CardTitle>
        </div>
        <CardDescription>Sign in to the inventory command center.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@crazybrownies.ae" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            New here?{" "}
            <Link href="/signup" className="underline underline-offset-4">Create an account</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
