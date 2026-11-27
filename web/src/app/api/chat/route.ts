import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { z } from "zod";

import { chatRequestSchema, toolActivitySchema } from "@/lib/chat-shape";
import { apiError, callBackend, relayBackendResponse, requireSameOrigin, unavailableResponse } from "@/lib/server/backend";

const streamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), delta: z.string() }),
  z.object({ type: z.literal("tool_activity"), activity: toolActivitySchema }),
  z.object({ type: z.literal("complete"), response: z.string(), tool_events: z.array(toolActivitySchema).default([]), usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), tokens_per_second: z.number().nonnegative() }).optional() }),
  z.object({ type: z.literal("error"), detail: z.string() }),
]);

function processEventData(data: string[], processLine: (line: string) => void): void {
  if (data.length === 0) return;
  const payload = data.join("\n");
  if (payload !== "[DONE]") processLine(payload);
}

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError("Enter a message to continue.", 400); }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid message.", 400);

  try {
    const upstream = await callBackend(
      `/sessions/${encodeURIComponent(parsed.data.sessionId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Prefer SSE while allowing old backends to keep their NDJSON stream.
          "Accept": "text/event-stream, application/x-ndjson",
          "Idempotency-Key": parsed.data.messageId,
        },
        body: JSON.stringify({
          content: parsed.data.content,
          model_id: parsed.data.modelId ?? null,
          reasoning_effort: parsed.data.reasoningEffort ?? null,
          model_controls: parsed.data.modelControls ?? {},
          regenerate_previous: parsed.data.regeneratePrevious ?? false,
        }),
        signal: request.signal,
      },
    );

    if (!upstream.ok) return relayBackendResponse(upstream);
    if (!upstream.body) return apiError("The myagent service returned an empty stream.", 502);
    const isSse = upstream.headers.get("content-type")?.includes("text/event-stream") ?? false;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventData: string[] = [];
        let textId: string | null = null;
        let streamedText = false;
        let finishReason: "stop" | "error" = "stop";

        const processLine = (line: string) => {
          if (!line.trim()) return;
          const result = streamEventSchema.safeParse(JSON.parse(line));
          if (!result.success) throw new Error("The myagent service returned an invalid stream event.");
          const event = result.data;
          if (event.type === "text_delta") {
            if (!textId) {
              textId = crypto.randomUUID();
              writer.write({ type: "text-start", id: textId });
            }
            streamedText = true;
            writer.write({ type: "text-delta", id: textId, delta: event.delta });
          } else if (event.type === "tool_activity") {
            writer.write({ type: "data-tool-activity", id: event.activity.tool_call_id, data: event.activity });
          } else if (event.type === "complete") {
            for (const activity of event.tool_events) {
              writer.write({ type: "data-tool-activity", id: activity.tool_call_id, data: activity });
            }
            if (!streamedText && event.response) {
              textId = crypto.randomUUID();
              writer.write({ type: "text-start", id: textId });
              writer.write({ type: "text-delta", id: textId, delta: event.response });
            }
            if (event.usage) writer.write({ type: "data-turn-usage", data: event.usage });
          } else {
            finishReason = "error";
            writer.write({ type: "error", errorText: event.detail });
          }
        };

        const processSseLine = (line: string) => {
          if (line === "") {
            processEventData(eventData, processLine);
            eventData = [];
            return;
          }
          if (line.startsWith(":")) return;
          const separator = line.indexOf(":");
          const field = separator < 0 ? line : line.slice(0, separator);
          if (field !== "data") return;
          const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
          eventData.push(value);
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (isSse) processSseLine(line);
              else processLine(line);
            }
            if (done) break;
          }
          if (buffer.length > 0) {
            if (isSse) processSseLine(buffer);
            else if (buffer.trim()) processLine(buffer);
          }
          if (isSse) processSseLine("");
        } finally {
          reader.releaseLock();
        }

        if (textId) writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish", finishReason });
      },
    });

    return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
  } catch {
    return unavailableResponse();
  }
}
