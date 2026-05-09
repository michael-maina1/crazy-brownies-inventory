import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";
import type { Profile } from "@/db/schema";
import { MobileNavTrigger } from "./sidebar";

export function TopBar({ profile }: { profile: Profile }) {
  const initials = (profile.fullName ?? profile.email)
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 border-b flex items-center justify-between gap-2 px-3 md:px-6 bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <div className="md:hidden">
          <MobileNavTrigger />
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="capitalize">{profile.role}</Badge>
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-sm font-medium">{profile.fullName ?? profile.email}</span>
          <span className="text-xs text-muted-foreground">{profile.email}</span>
        </div>
        <form action={logout}>
          <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
