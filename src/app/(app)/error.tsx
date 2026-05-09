"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6 flex items-start justify-center">
      <div className="max-w-md w-full text-center space-y-4 mt-12">
        <div className="size-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          {error.digest ? (
            <p className="text-[11px] text-muted-foreground/70 font-mono">ref: {error.digest}</p>
          ) : null}
        </div>
        <Button onClick={reset} variant="secondary">Try again</Button>
      </div>
    </div>
  );
}
