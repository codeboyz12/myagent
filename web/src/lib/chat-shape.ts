import type { UIMessage } from "ai";
import { z } from "zod";

export const sessionSummarySchema = z.object({
  session_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  last_turn_status: z.string().nullable(),
  title: z.string().nullable().optional(),
});

export const sessionListSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export const modelListSchema = z.object({
  models: z.array(
    z.object({ id: z.string(), name: z.string(), alias: z.string().optional() }),
  ),
  selected_model: z.string(),
});

export const modelSettingsSchema = z.object({
  configured: z.boolean(),
  base_url: z.string(),
  model_id: z.string(),
  reasoning_effort: z.enum(["default", "low", "medium", "high"]),
  api_key_configured: z.boolean(),
  active_provider_id: z.string().nullable().optional(),
  model_controls: z.array(z.object({
    id: z.string(),
    name: z.string(),
    parameter: z.string(),
    options: z.array(z.object({ label: z.string(), value: z.string() })),
    default_value: z.string().nullable(),
  })).default([]),
  model_control_selections: z.record(z.string(), z.string()).default({}),
});

const modelControlDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  parameter: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string() })),
  default_value: z.string().nullable(),
});
export type ModelControl = z.infer<typeof modelControlDefinitionSchema>;

export const modelProvidersSchema = z.object({
  providers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    base_url: z.string(),
    model_id: z.string(),
    reasoning_effort: z.enum(["default", "low", "medium", "high"]),
    auth_type: z.enum(["api_key", "chatgpt_plan"]).optional(),
    enabled: z.boolean(),
    api_key_configured: z.boolean(),
    model_controls: z.record(z.string(), z.array(modelControlDefinitionSchema)).default({}),
    model_control_selections: z.record(z.string(), z.record(z.string(), z.string())).default({}),
    models: z.array(z.object({ id: z.string(), name: z.string(), alias: z.string().optional() })).default([]),
  })),
  active_provider_id: z.string().nullable(),
});
export type ModelProvider = z.infer<typeof modelProvidersSchema>["providers"][number];

export const toolActivitySchema = z.object({
  tool_call_id: z.string(),
  tool_name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(["running", "completed", "error"]),
  sources: z.array(z.object({
    url: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://")),
    title: z.string().optional(),
  })).default([]),
  images: z.array(z.object({
    url: z.string().url().refine((value) => value.startsWith("https://")),
    source_url: z.string().url().refine((value) => value.startsWith("https://")),
    title: z.string().optional(),
  })).default([]),
});

export type ToolActivity = z.infer<typeof toolActivitySchema>;

export const turnUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  tokens_per_second: z.number().nonnegative(),
});
export type TurnUsage = z.infer<typeof turnUsageSchema>;

export const sessionHistorySchema = z.object({
  session_id: z.string().uuid(),
  messages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      tool_events: z.array(toolActivitySchema).default([]),
    }),
  ),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
  messageId: z.string().min(1).max(256),
  modelId: z.string().min(1).max(256).nullable().optional(),
  reasoningEffort: z.enum(["default", "low", "medium", "high"]).nullable().optional(),
  modelControls: z.record(z.string(), z.string().nullable()).optional(),
  regeneratePrevious: z.boolean().optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionHistory = z.infer<typeof sessionHistorySchema>;

export function toUIMessages(history: SessionHistory): UIMessage[] {
  return history.messages.map((message) => ({
    id: `${history.session_id}-${message.index}`,
    role: message.role,
    parts: [
      { type: "text", text: message.content },
      ...message.tool_events.map((activity) => ({
        type: "data-tool-activity" as const,
        id: activity.tool_call_id,
        data: activity,
      })),
    ],
  }));
}

export function getMessageText(message: UIMessage | undefined): string {
  if (!message) return "";

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function getSessionLabel(session: SessionSummary): string {
  if (session.title?.trim()) {
    const title = session.title.trim().replace(/\s+/g, " ");
    return title.length > 32 ? `${title.slice(0, 31).trimEnd()}…` : title;
  }
  return "New chat";
}
