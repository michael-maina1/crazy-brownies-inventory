import { AssistantChat } from "@/components/app/assistant-chat";

export default function AssistantPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask Claude about stock, sales, and what to reorder today. Grounded in live data.
        </p>
      </header>
      <div className="flex-1 min-h-0 px-6 pb-6 mt-4">
        <AssistantChat />
      </div>
    </div>
  );
}
