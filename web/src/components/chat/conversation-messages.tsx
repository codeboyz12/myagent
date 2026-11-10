"use client";

import type { UIMessage } from "ai";
import type { ActionEvent, OpenUIError, ParseResult } from "@openuidev/react-lang";
import { Renderer } from "@openuidev/react-lang";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toolActivitySchema, type ToolActivity } from "@/lib/chat-shape";
import { myagentOpenUILibrary } from "@/lib/openui";
import { normalizeEscapedNewlines, normalizeOpenUIEscapedNewlines } from "@/lib/openui-text";
import { StreamedToolActivity } from "./streamed-tool-activity";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
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
  onOpenUIAction: (event: ActionEvent) => void;
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

function GeneratedOpenUIMessage({
  text,
  isStreaming,
  onAction,
}: {
  text: string;
  isStreaming: boolean;
  onAction: (event: ActionEvent) => void;
}) {
  const [showPlaceholder, setShowPlaceholder] = useState(isStreaming);
  const [renderFailed, setRenderFailed] = useState(false);
  const rendererRoot = useRef<HTMLDivElement>(null);
  const plainText = normalizeEscapedNewlines(
    text.replace(/```openui(?:-lang)?[^\n]*\n[\s\S]*?```/gi, "").trim(),
  );

  const handleParseResult = (result: ParseResult | null) => {
    const ready = Boolean(
      result?.root &&
        !result.meta.incomplete &&
        result.meta.unresolved.length === 0 &&
        result.meta.errors.length === 0,
    );
    setShowPlaceholder(!ready);
  };

  const handleError = (errors: OpenUIError[]) => {
    if (!isStreaming && errors.length > 0) setRenderFailed(true);
  };

  useEffect(() => {
    const root = rendererRoot.current;
    if (!root) return;

    const revealSelectedTabs = () => {
      root.querySelectorAll<HTMLElement>(".openui-tabs-list").forEach((list) => {
        const selected = list.querySelector<HTMLElement>(
          '[role="tab"][data-state="active"]',
        );
        if (!selected) return;

        const listRect = list.getBoundingClientRect();
        const tabRect = selected.getBoundingClientRect();
        if (tabRect.left < listRect.left || tabRect.right > listRect.right) {
          list.scrollTo({
            left: Math.max(
              0,
              selected.offsetLeft - list.clientWidth / 2 + selected.offsetWidth / 2,
            ),
            behavior: "auto",
          });
        }
      });
    };

    let frame = 0;
    const scheduleReveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealSelectedTabs);
    };
    const observer = new MutationObserver(scheduleReveal);
    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-state"],
    });
    scheduleReveal();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  if (renderFailed) {
    return (
      <Bubble className="max-w-full" align="start" variant="ghost">
        <BubbleContent className="w-full min-w-0 text-[14px] leading-[1.72] text-left wrap-anywhere *:first:mt-0 *:last:mb-0 [&_p]:m-[0_0_.8em] [&_ul]:m-[.25em_0_.8em] [&_ul]:pl-[1.45em] [&_ol]:m-[.25em_0_.8em] [&_ol]:pl-[1.45em] [&_ul]:list-disc [&_ol]:list-decimal [&_li]:pl-[.15em] [&_li+li]:mt-[.15em] [&_h1]:m-[1.1em_0_.45em] [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h2]:m-[1.1em_0_.45em] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h3]:m-[1.1em_0_.45em] [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h1]:text-[1.35em] [&_h2]:text-[1.2em] [&_h3]:text-[1.08em] [&_blockquote]:m-[.6em_0] [&_blockquote]:pl-[1em] [&_blockquote]:border-l-2 border-border [&_blockquote]:text-muted-foreground [&_:not(pre)_>_code]:rounded-lg [&_:not(pre)_>_code]:p-[.12em_.35em] [&_:not(pre)_>_code]:bg-accent [&_:not(pre)_>_code]:text-[.9em] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:leading-[1.55] [&_pre_code]:wrap-normal [&_pre_code]:whitespace-pre [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[12px] [&_th]:border [&_th]:border-border [&_th]:p-[5px_8px] [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-[5px_8px] [&_td]:text-left text-foreground [&_pre]:bg-muted">
          {plainText ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{plainText}</ReactMarkdown>
          ) : (
            <p>I couldn’t render that interactive view. Please try asking again.</p>
          )}
        </BubbleContent>
      </Bubble>
    );
  }

  return (
      <div ref={rendererRoot} className="openui-generated-response text-[15px] leading-[1.65] [&_.openui-text-content-markdown]:text-[15px] [&_.openui-text-content-markdown]:leading-[1.75] [&_.openui-text-content-markdown_p]:text-[15px] [&_.openui-text-content-markdown_p]:leading-[1.75] [&_.openui-text-content-markdown_h1]:leading-[1.35] [&_.openui-text-content-markdown_h1]:mt-[1.2em] [&_.openui-text-content-markdown_h1]:mb-[0.6em] [&_.openui-text-content-markdown_h2]:leading-[1.35] [&_.openui-text-content-markdown_h2]:mt-[1.2em] [&_.openui-text-content-markdown_h2]:mb-[0.6em] [&_.openui-text-content-markdown_h3]:leading-[1.35] [&_.openui-text-content-markdown_h3]:mt-[1.2em] [&_.openui-text-content-markdown_h3]:mb-[0.6em]">
      {showPlaceholder && (
        <div className="openui-stream-placeholder grid content-center gap-4 w-full min-h-65 m-[2px_0_12px] p-6 border border-border rounded-xl bg-background [&_p]:m-[0_0_4px] [&_p]:text-muted-foreground [&_p]:text-[12px] [&_span]:block [&_span]:w-[72%] [&_span]:h-3.5 [&_span]:rounded-full [&_span]:bg-muted [&_span]:animate-pulse [&_span:last-child]:w-[52%]" role="status" aria-label="Building interactive interface">
          <p>Building your interactive view…</p>
          <span className="in-[.openui-stream-placeholder]:w-[42%] in-[.openui-stream-placeholder]:h-5" />
          <span />
          <span />
        </div>
      )}
      <div
        aria-hidden={showPlaceholder}
        className={showPlaceholder ? "hidden" : ""}
      >
        <Renderer
          library={myagentOpenUILibrary}
          response={normalizeOpenUIEscapedNewlines(text)}
          isStreaming={isStreaming}
          onAction={onAction}
          onParseResult={handleParseResult}
          onError={handleError}
        />
      </div>
    </div>
  );
}

export function ConversationMessages({ messages, busy, onOpenUIAction }: ConversationMessagesProps) {
  const currentAssistantActivities = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const currentAssistantToolActivities = currentAssistantActivities
    ? getToolActivities(currentAssistantActivities)
    : [];

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1 overflow-y-auto scrollbar-thin [scrollbar-color:var(--border)_transparent]" aria-live="polite">
        <MessageScrollerViewport>
          <MessageScrollerContent className="gap-6.25 p-[31px_0_24px]">
            {messages.length === 0 ? (
              <MessageScrollerItem messageId="session-empty">
                <Empty className="grid justify-items-center content-center h-full min-h-65 text-center **:data-[slot=empty-title]:m-0 **:data-[slot=empty-title]:text-[21px] **:data-[slot=empty-title]:font-[570] **:data-[slot=empty-title]:tracking-[-.035em] **:data-[slot=empty-description]:m-[10px_0_0] **:data-[slot=empty-description]:text-muted-foreground **:data-[slot=empty-description]:text-[12px] [&_h1]:m-0 [&_h1]:text-[21px] [&_h1]:font-[570] [&_h1]:tracking-[-.035em] [&_p]:m-[10px_0_0] [&_p]:text-muted-foreground [&_p]:text-[12px]">
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
                  const isUser = message.role === "user";
                  const renderedText = isUser ? text : normalizeEscapedNewlines(text);
                  const toolActivities = getToolActivities(message);
                  if (!text && toolActivities.length === 0) return null;

                  const hasOpenUI = !isUser && /```openui(?:-lang)?\b/i.test(text);
                  const isStreamingMessage = busy && message.id === messages.at(-1)?.id;
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={isUser}
                    >
                      <Message className="flex items-start gap-3" align={isUser ? "end" : "start"}>
                        <MessageContent
                          className={`message-content  min-w-0 max-w-[84%] text-left max-[760px]:max-w-[91%] max-[560px]:max-w-[94%]${isUser ? "user-message w-fit max-w-[84%] ml-auto p-0 border-0 bg-transparent p-[12px_15px] border border-border rounded-[16px_4px_16px_16px] bg-accent max-[560px]:max-w-[94%]" : "assistant-message pt-0"}`}
                        >
                          <MessageHeader className="m-[2px_0_7px] text-[10px] font-[550] tracking-[.02em] text-muted-foreground">
                            {isUser ? "You" : "myagent"}
                          </MessageHeader>
                          {!isUser && !busy && toolActivities.length > 0 && (
                            <StreamedToolActivity activities={toolActivities} busy={busy} />
                          )}
                          {!text ? null : hasOpenUI ? (
                            <GeneratedOpenUIMessage
                              text={text}
                              isStreaming={isStreamingMessage}
                              onAction={onOpenUIAction}
                            />
                          ) : (
                          <Bubble
                            className="max-w-full"
                            align={isUser ? "end" : "start"}
                            variant={isUser ? "muted" : "ghost"}
                          >
                            <BubbleContent className="w-full min-w-0 text-[14px] leading-[1.72] text-left wrap-anywhere *:first:mt-0 *:last:mb-0 [&_p]:m-[0_0_.8em] [&_ul]:m-[.25em_0_.8em] [&_ul]:pl-[1.45em] [&_ol]:m-[.25em_0_.8em] [&_ol]:pl-[1.45em] [&_ul]:list-disc [&_ol]:list-decimal [&_li]:pl-[.15em] [&_li+li]:mt-[.15em] [&_h1]:m-[1.1em_0_.45em] [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h2]:m-[1.1em_0_.45em] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h3]:m-[1.1em_0_.45em] [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h1]:text-[1.35em] [&_h2]:text-[1.2em] [&_h3]:text-[1.08em] [&_blockquote]:m-[.6em_0] [&_blockquote]:pl-[1em] [&_blockquote]:border-l-2 border-border [&_blockquote]:text-muted-foreground [&_:not(pre)_>_code]:rounded-lg [&_:not(pre)_>_code]:p-[.12em_.35em] [&_:not(pre)_>_code]:bg-accent [&_:not(pre)_>_code]:text-[.9em] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:leading-[1.55] [&_pre_code]:wrap-normal [&_pre_code]:whitespace-pre [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[12px] [&_th]:border [&_th]:border-border [&_th]:p-[5px_8px] [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:p-[5px_8px] [&_td]:text-left text-foreground [&_pre]:bg-muted">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedText}</ReactMarkdown>
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
                    <div className="flex items-center gap-2.5" role="status">
                      <StreamedToolActivity activities={currentAssistantToolActivities} busy />
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
