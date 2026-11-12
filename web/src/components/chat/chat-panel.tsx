"use client";

import { DefaultChatTransport } from "ai";
import type { ActionEvent } from "@openuidev/react-lang";
import { useChat } from "@ai-sdk/react";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getSessionLabel,
  getMessageText,
  sessionHistorySchema,
  toUIMessages,
} from "@/lib/chat-shape";
import { Icon } from "@/components/icon";
import { MessageComposer } from "./message-composer";
import { useChatWorkspace } from "@/components/workspace/chat-workspace";
import { ConversationMessages } from "./conversation-messages";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useModelSettings } from "@/hooks/use-model-settings";
import { ModelSettingsControls } from "./model-settings-controls";

export { ChatWelcome } from "./chat-welcome";

async function errorText(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
  } catch {
    // Use a consistent fallback below.
  }
  return response.status === 429
    ? "You’re sending messages too quickly. Wait a moment and try again."
    : "Could not complete your message. Please try again.";
}

export function ChatPanel() {
  return (
    <Suspense
      fallback={
        <div
          className="flex-1 flex items-center justify-center gap-2.5 text-muted-foreground"
          role="status"
        >
          <Spinner />
          <span>Opening conversation…</span>
        </div>
      }
    >
      <SessionChatRoute />
    </Suspense>
  );
}

function SessionChatRoute() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  return <SessionChat key={sessionId} sessionId={sessionId} />;
}

function SessionChat({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { consumePendingMessage, refreshSessions, sessions, setActiveSession } =
    useChatWorkspace();
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const settings = useModelSettings();
  const requestSettings = settings.requestSettings;
  const sendFailed = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger }) => {
          const latest = trigger === "regenerate-message"
            ? [...messages].reverse().find((message) => message.role === "user")
            : messages.at(-1);
          return {
            body: {
              sessionId: id,
              content: getMessageText(latest),
              messageId: trigger === "regenerate-message" ? crypto.randomUUID() : latest?.id,
              regeneratePrevious: trigger === "regenerate-message",
              modelId: requestSettings.current.modelId,
              reasoningEffort: requestSettings.current.effort,
              modelControls: requestSettings.current.modelControls,
            },
          };
        },
      }),
    [requestSettings],
  );

  const { messages, sendMessage, regenerate, stop, status, error, setMessages, clearError } =
    useChat({
      id: sessionId,
      transport,
      onError: () => {
        sendFailed.current = true;
      },
      onFinish: () => {
        void refreshSessions();
      },
    });

  useEffect(() => {
    let mounted = true;
    void fetch(`/api/sessions/${sessionId}/messages`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/signin");
          return;
        }
        if (response.status === 404) {
          router.replace("/chat");
          return;
        }
        if (!response.ok) throw new Error(await errorText(response));

        const history = sessionHistorySchema.safeParse(await response.json());
        if (!history.success)
          throw new Error("Could not read this conversation.");
        if (mounted) {
          setMessages(toUIMessages(history.data));
          setHistoryLoaded(true);
        }
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setHistoryError(
            reason instanceof Error
              ? reason.message
              : "Could not load this conversation.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [router, sessionId, setMessages]);

  const sendText = useCallback(
    async (text: string) => {
      sendFailed.current = false;
      clearError();
      await sendMessage({ text });
      return !sendFailed.current;
    },
    [clearError, sendMessage],
  );

  const sendOpenUIAction = useCallback(
    (event: ActionEvent) => {
      if (event.type !== "continue_conversation") return;
      const message = event.humanFriendlyMessage.trim();
      if (!message) return;
      const formState = Object.entries(event.formState ?? {})
        .map(
          ([name, value]) =>
            `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
        )
        .join("\n");
      const context = event.params.context;
      const sections = [message];
      if (typeof context === "string" && context.trim())
        sections.push(context.trim());
      if (formState) sections.push(`Submitted values:\n${formState}`);
      void sendText(sections.join("\n\n"));
    },
    [sendText],
  );

  useEffect(() => {
    if (!historyLoaded || !settings.loaded || !settings.configured) return;
    const pendingMessage = consumePendingMessage(sessionId);
    if (pendingMessage) void sendText(pendingMessage);
  }, [
    consumePendingMessage,
    historyLoaded,
    sendText,
    sessionId,
    settings.configured,
    settings.loaded,
  ]);

  const busy = status === "submitted" || status === "streaming";
  const sessionTitle = sessions.find(
    (session) => session.session_id === sessionId,
  );

  useEffect(() => {
    setActiveSession(sessionId);
  }, [sessionId, setActiveSession]);

  return (
    <section
      className="min-h-screen h-screen flex flex-col m-[0_auto] p-[0_42px_25px] max-[760px]:h-[calc(100dvh-52px)] max-[760px]:min-h-120 max-[760px]:p-[0_18px_14px] w-[min(1040px,100%)] pr-12 pl-12 max-[760px]:pr-5.5 max-[760px]:pl-5.5 max-[560px]:pr-4 max-[560px]:pl-4"
      aria-label="Conversation"
    >
      <div className="h-16.5 flex-[0_0_66px] flex items-center justify-between gap-3 border-b border-border max-[760px]:h-auto max-[760px]:min-h-14.5 max-[760px]:flex-[0_0_auto] max-[760px]:p-[8px_0]">
        <div className="flex items-center gap-2.25 text-[12px] font-[550] text-foreground">
          <h1
            className="m-0 overflow-hidden max-w-[40ch] text-ellipsis whitespace-nowrap"
            title={sessionTitle?.title ?? "New chat"}
          >
            {sessionTitle ? getSessionLabel(sessionTitle) : "New chat"}
          </h1>
        </div>
        {settings.error && (
          <span className="text-destructive text-[10px]" role="alert">
            {settings.error}
          </span>
        )}
      </div>

      {!historyLoaded && !historyError ? (
        <div
          className="flex-1 flex items-center justify-center gap-2.5 text-muted-foreground"
          role="status"
        >
          <Spinner />
          <span>Opening conversation…</span>
        </div>
      ) : historyError ? (
        <Alert className="conversation-error" variant="destructive">
          <Icon name="chat" />
          <AlertDescription>{historyError}</AlertDescription>
          <Button
            className="p-[3px_0] border-0 bg-transparent text-muted-foreground text-[11px] underline cursor-pointer"
            variant="link"
            onClick={() => router.replace("/chat")}
          >
            Back to conversations
          </Button>
        </Alert>
      ) : (
        <>
          <ConversationMessages
            messages={messages}
            busy={busy}
            onOpenUIAction={sendOpenUIAction}
            onRegenerate={() => void regenerate()}
          />

          {error && (
            <Alert
              className="flex justify-between items-center gap-3 mt-3.5"
              variant="destructive"
            >
              <AlertDescription>
                {error.message || "Could not complete that message."}
              </AlertDescription>
              <Button
                className="p-[3px_0] border-0 bg-transparent text-muted-foreground text-[11px] underline cursor-pointer"
                variant="link"
                onClick={clearError}
              >
                Dismiss
              </Button>
            </Alert>
          )}

          <MessageComposer
            onSend={sendText}
            onStop={() => void stop()}
            busy={busy}
            disabled={
              !historyLoaded || !settings.loaded || !settings.configured || busy
            }
            placeholder={busy ? "myagent is thinking…" : "Message myagent…"}
            settingsControls={
              <ModelSettingsControls
                models={settings.models}
                modelId={settings.selectedModelValue}
                onModelChange={settings.selectModel}
                controls={settings.modelControls}
                selections={settings.controlSelections}
                onControlChange={settings.selectModelControl}
                disabled={!settings.loaded || !settings.configured || busy}
              />
            }
          />
        </>
      )}
    </section>
  );
}
