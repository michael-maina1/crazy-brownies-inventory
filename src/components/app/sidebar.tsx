"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  Cookie,
  ShoppingCart,
  Sparkles,
  Truck,
  PackagePlus,
  Bell,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/inventory/receive", label: "Receive", icon: PackagePlus },
  { href: "/products", label: "Products", icon: Cookie },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
];

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <div className="size-9 rounded-lg bg-brand text-brand-foreground flex items-center justify-center font-display font-semibold text-base shadow-sm">
        CB
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-display font-semibold text-base tracking-tight">Crazy Brownies</span>
        <span className="text-[11px] text-muted-foreground tracking-wide uppercase">Command Center</span>
      </div>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 p-3 space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:border-r md:bg-card">
      <div className="px-5 py-5 border-b">
        <Brand />
      </div>
      <NavList />
      <div className="px-5 py-3 text-xs text-muted-foreground border-t">v0.1 · Dubai</div>
    </aside>
  );
}

export function MobileNavTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Crazy Brownies Command Center menu</SheetDescription>
        <div className="px-5 py-5 border-b">
          <Brand />
        </div>
        <NavList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
