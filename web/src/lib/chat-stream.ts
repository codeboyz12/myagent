import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { ToolActivity } from "@/lib/chat-shape";

export function completedAnswerStream(
  answer: string,
  toolEvents: ToolActivity[] = [],
): Response {
  const partId = crypto.randomUUID();
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "start" });
      for (const activity of toolEvents) {
        writer.write({ type: "data-tool-activity", data: activity });
      }
      writer.write({ type: "text-start", id: partId });
      writer.write({ type: "text-delta", id: partId, delta: answer });
      writer.write({ type: "text-end", id: partId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
  });
}
