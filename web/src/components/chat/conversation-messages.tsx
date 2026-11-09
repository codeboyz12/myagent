"use client";

import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CircleAlertIcon, SparklesIcon, WrenchIcon } from "lucide-react";

import { toolActivitySchema, type ToolActivity } from "@/lib/chat-shape";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

type ConversationMessagesProps = {
  messages: UIMessage[];
  busy: boolean;
};

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getToolActivities(message: UIMessage): ToolActivity[] {
  return message.parts.flatMap((part) => {
    if (part.type !== "data-tool-activity") return [];
    const result = toolActivitySchema.safeParse(part.data);
    return result.success ? [result.data] : [];
  });
}

function getToolTitle(activity: ToolActivity): string {
  if (activity.tool_name === "list_skills") return "Found available skills";
  if (activity.tool_name === "load_skill") {
    const skillName = activity.arguments.skill_name;
    return `Loaded skill${typeof skillName === "string" ? `: ${skillName}` : ""}`;
  }
  return `Used tool: ${activity.tool_name.replaceAll("_", " ")}`;
}

export function ConversationMessages({ messages, busy }: ConversationMessagesProps) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="message-scroll-area" aria-live="polite">
        <MessageScrollerViewport>
          <MessageScrollerContent className="message-list">
            {messages.length === 0 ? (
              <MessageScrollerItem messageId="session-empty">
                <Empty className="session-empty-state">
                  <EmptyHeader>
                    <EmptyTitle>What would you like to work on?</EmptyTitle>
                    <EmptyDescription>
                      Your conversation history stays with this session.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </MessageScrollerItem>
            ) : (
              <>
                {messages.map((message) => {
                  const text = getMessageText(message);
                  const toolActivities = getToolActivities(message);
                  if (!text && toolActivities.length === 0) return null;

                  const isUser = message.role === "user";
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={isUser}
                    >
                      <Message className="message-row" align={isUser ? "end" : "start"}>
                        <MessageContent
                          className={`message-content ${isUser ? "user-message" : "assistant-message"}`}
                        >
                          <MessageHeader className="message-role">
                            {isUser ? "You" : "myagent"}
                          </MessageHeader>
                          {!isUser && toolActivities.length > 0 && (
                            <Trace className="message-tool-activity">
                              {toolActivities.map((activity) => (
                                <TraceCollapsible key={activity.tool_call_id}>
                                  <TraceCollapsibleTrigger>
                                    <TraceLine status={activity.status === "error" ? "error" : undefined}>
                                      <TraceIcon>
                                        {activity.status === "error" ? <CircleAlertIcon /> :
                                          activity.tool_name.includes("skill") ? <SparklesIcon /> : <WrenchIcon />}
                                      </TraceIcon>
                                      <TraceTitle>{getToolTitle(activity)}</TraceTitle>
                                    </TraceLine>
                                  </TraceCollapsibleTrigger>
                                  <TraceCollapsibleContent>
                                    {Object.keys(activity.arguments).length > 0 ? (
                                      <pre className="tool-activity-arguments">{JSON.stringify(activity.arguments, null, 2)}</pre>
                                    ) : "No arguments."}
                                  </TraceCollapsibleContent>
                                </TraceCollapsible>
                              ))}
                            </Trace>
                          )}
                          {!text ? null : (
                          <Bubble
                            className="chat-bubble"
                            align={isUser ? "end" : "start"}
                            variant={isUser ? "muted" : "ghost"}
                          >
                            <BubbleContent className="message-text">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                            </BubbleContent>
                          </Bubble>
                          )}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  );
                })}
                {busy && (
                  <MessageScrollerItem messageId="assistant-thinking">
                    <div className="thinking-row" role="status">
                      <span className="thinking-dots"><i /><i /><i /></span>
                      <span className="thinking-label">myagent is thinking</span>
                    </div>
                  </MessageScrollerItem>
                )}
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
