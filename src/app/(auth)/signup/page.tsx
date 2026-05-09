"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="size-9 rounded-lg bg-brand text-brand-foreground flex items-center justify-center font-display font-semibold text-base shadow-sm">
            CB
          </div>
          <CardTitle className="font-display text-2xl tracking-tight">Create account</CardTitle>
        </div>
        <CardDescription>The first account becomes the owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required autoComplete="name" placeholder="Mike Aboumahmoud" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={6} />
          </div>
          {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
