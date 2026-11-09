import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  getMessageText,
  sessionHistorySchema,
  toUIMessages,
} from "@/lib/chat-shape";
import { completedAnswerStream } from "@/lib/chat-stream";

const sessionId = "8599ee19-5adb-48de-97c1-ac79f3c06391";

describe("session history and AI SDK message conversion", () => {
  it("preserves order, roles, content, and stable history ids", () => {
    const history = sessionHistorySchema.parse({
      session_id: sessionId,
      messages: [
        { index: 2, role: "assistant", content: "Second" },
        { index: 0, role: "user", content: "First" },
      ],
    });

    const firstConversion = toUIMessages(history);
    expect(toUIMessages(history)).toEqual(firstConversion);
    expect(firstConversion).toEqual([
      {
        id: `${sessionId}-2`,
        role: "assistant",
        parts: [{ type: "text", text: "Second" }],
      },
      {
        id: `${sessionId}-0`,
        role: "user",
        parts: [{ type: "text", text: "First" }],
      },
    ]);
  });

  it("extracts text parts for the Python API payload", () => {
    expect(
      getMessageText({
        id: "message-1",
        role: "user",
        parts: [
          { type: "text", text: "  hello " },
          { type: "text", text: "world  " },
        ],
      }),
    ).toBe("hello world");
    expect(getMessageText(undefined)).toBe("");
  });

  it("rejects invalid session ids, blank content, and malformed history roles", () => {
    expect(
      chatRequestSchema.safeParse({
        sessionId: "not-a-uuid",
        content: "Hello",
        messageId: "message-1",
      }).success,
    ).toBe(false);
    expect(
      chatRequestSchema.safeParse({
        sessionId,
        content: "  ",
        messageId: "message-1",
      }).success,
    ).toBe(false);
    expect(
      sessionHistorySchema.safeParse({
        session_id: sessionId,
        messages: [{ index: 0, role: "system", content: "hidden" }],
      }).success,
    ).toBe(false);
  });
});

describe("AI SDK UI stream adapter", () => {
  it("encodes a completed Python answer as a valid text message stream", async () => {
    const response = completedAnswerStream("A durable answer.");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain('"type":"text-start"');
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain('"delta":"A durable answer."');
    expect(body).toContain('"type":"text-end"');
    expect(body).toContain("data: [DONE]");
  });
});
