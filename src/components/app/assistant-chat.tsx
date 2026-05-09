"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Send, Wrench, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
};

const SUGGESTIONS = [
  "What ingredients are running low?",
  "Recommend what to reorder today and roughly how much each will cost.",
  "Which products are most profitable in the last 30 days?",
  "Forecast demand for the Viral Pistachio Kunafa Bar (Milk) next week.",
  "If pistachio cream runs out, which products are blocked and what's the revenue impact?",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((cur) => [...cur, { role: "assistant", content: `Sorry — ${data.error ?? "something went wrong."}` }]);
      } else {
        setMessages((cur) => [...cur, { role: "assistant", content: data.text, toolsUsed: data.toolsUsed }]);
      }
    } catch (err) {
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: `Network error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <EmptyState onPick={send} />
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} />)
          )}
          {pending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand animate-pulse" />
              <span>Thinking…</span>
            </div>
          ) : null}
        </div>

        <CardContent className="border-t p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about inventory, forecasts, what to reorder…"
              rows={1}
              className="min-h-9 resize-none"
              disabled={pending}
            />
            <Button type="submit" size="icon" disabled={pending || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-10">
      <div className="size-12 rounded-xl bg-brand text-brand-foreground flex items-center justify-center mb-4">
        <Sparkles className="size-6" />
      </div>
      <h3 className="font-display text-xl tracking-tight">Operations co-pilot</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Grounded in your live inventory, sales, and recipes. Try one of these:
      </p>
      <div className="grid grid-cols-1 gap-2 mt-5 w-full max-w-md">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-sm rounded-md border border-border bg-card hover:bg-accent px-3 py-2 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "size-7 rounded-md flex items-center justify-center shrink-0",
          isUser ? "bg-foreground text-background" : "bg-brand text-brand-foreground",
        )}
      >
        {isUser ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "flex justify-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap",
            isUser ? "bg-foreground text-background" : "bg-muted text-foreground",
          )}
        >
          {message.content}
        </div>
        {message.toolsUsed && message.toolsUsed.length > 0 ? (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wrench className="size-3" />
            <span>
              Used: {Array.from(new Set(message.toolsUsed)).join(", ")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
