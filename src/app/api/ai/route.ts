import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TOOLS, runTool } from "@/lib/ai/tools";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { requireProfile } from "@/lib/auth";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 6;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
const bodySchema = z.object({
  messages: z.array(messageSchema).min(1),
});

export async function POST(req: Request) {
  await requireProfile();

  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Convert plain user/assistant text turns into Anthropic message format.
  // Tool-use round-trips happen entirely server-side and don't need to be
  // round-tripped to the client.
  const conversation: Anthropic.MessageParam[] = body.data.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolsUsed: string[] = [];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      // Cache the (large, stable) system prompt + tool list so subsequent turns
      // in the same session pay the cheaper cache-read price.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS.map((t, idx) =>
        idx === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
      ),
      messages: conversation,
    });

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n")
        .trim();
      return NextResponse.json({ text, toolsUsed });
    }

    // Append assistant turn (preserve all blocks, including tool_use)
    conversation.push({ role: "assistant", content: response.content });

    // Execute each tool_use block; collect tool_result blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      try {
        const output = await runTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        });
      }
    }
    conversation.push({ role: "user", content: toolResults });
  }

  return NextResponse.json(
    { error: "Reached tool-iteration limit without a final answer.", toolsUsed },
    { status: 500 },
  );
}
