"use client";

import { useEffect } from "react";

/**
 * Fires window.print() once the labels page has rendered, then renders a
 * "print again" button so the operator can re-trigger if the auto-fire is
 * blocked by the browser. Lives in a client component so the labels page
 * itself can stay a Server Component (which forbids inline onClick handlers).
 */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-print mt-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
      >
        Open print dialog again
      </button>
    </div>
  );
}
