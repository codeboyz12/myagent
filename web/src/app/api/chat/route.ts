import { chatRequestSchema, toolActivitySchema } from "@/lib/chat-shape";
import { z } from "zod";
import { completedAnswerStream } from "@/lib/chat-stream";
import {
  apiError,
  callBackend,
  relayBackendResponse,
  requireSameOrigin,
  unavailableResponse,
} from "@/lib/server/backend";

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Enter a message to continue.", 400);
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Enter a valid message.", 400);
  }

  try {
    const upstream = await callBackend(
      `/sessions/${encodeURIComponent(parsed.data.sessionId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": parsed.data.messageId,
        },
        body: JSON.stringify({
          content: parsed.data.content,
          model_id: parsed.data.modelId ?? null,
          reasoning_effort: parsed.data.reasoningEffort ?? null,
          model_controls: parsed.data.modelControls ?? {},
        }),
        signal: request.signal,
      },
    );

    if (!upstream.ok) return relayBackendResponse(upstream);

    const result: unknown = await upstream.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("response" in result) ||
      typeof result.response !== "string"
    ) {
      return apiError("The myagent service returned an invalid response.", 502);
    }

    const toolEvents =
      "tool_events" in result && Array.isArray(result.tool_events)
        ? z.array(toolActivitySchema).safeParse(result.tool_events)
        : { success: true as const, data: [] };
    return completedAnswerStream(
      result.response,
      toolEvents.success ? toolEvents.data : [],
    );
  } catch {
    return unavailableResponse();
  }
}
