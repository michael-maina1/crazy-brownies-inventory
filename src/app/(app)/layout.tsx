import { requireProfile } from "@/lib/auth";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/topbar";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <div className="flex h-svh w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar profile={profile} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <RealtimeRefresh />
    </div>
  );
}
