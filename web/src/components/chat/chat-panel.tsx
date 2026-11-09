"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
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
        <div className="history-loading" role="status">
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
  const { consumePendingMessage, refreshSessions, sessions, setActiveSession } = useChatWorkspace();
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const settings = useModelSettings();
  const requestSettings = settings.requestSettings;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => {
          const latest = messages.at(-1);
          return {
            body: {
              sessionId: id,
              content: getMessageText(latest),
              messageId: latest?.id,
              modelId: requestSettings.current.modelId,
              reasoningEffort: requestSettings.current.effort,
              modelControls: requestSettings.current.modelControls,
            },
          };
        },
      }),
    [requestSettings],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    clearError,
  } = useChat({
    id: sessionId,
    transport,
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
        if (!history.success) throw new Error("Could not read this conversation.");
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
      clearError();
      await sendMessage({ text });
    },
    [clearError, sendMessage],
  );

  useEffect(() => {
    if (!historyLoaded || !settings.loaded || !settings.configured) return;
    const pendingMessage = consumePendingMessage(sessionId);
    if (pendingMessage) void sendText(pendingMessage);
  }, [consumePendingMessage, historyLoaded, sendText, sessionId, settings.configured, settings.loaded]);

  const busy = status === "submitted" || status === "streaming";
  const sessionTitle = sessions.find((session) => session.session_id === sessionId);

  useEffect(() => {
    setActiveSession(sessionId);
  }, [sessionId, setActiveSession]);

  return (
    <section className="chat-view" aria-label="Conversation">
      <div className="conversation-topline">
        <div className="conversation-title">
          <span className="conversation-name">{sessionTitle?.title?.trim() || "New chat"}</span>
        </div>
        {settings.error && <span className="model-settings-error-inline" role="alert">{settings.error}</span>}
      </div>

      {!historyLoaded && !historyError ? (
        <div className="history-loading" role="status">
          <Spinner />
          <span>Opening conversation…</span>
        </div>
      ) : historyError ? (
        <Alert className="conversation-error" variant="destructive">
          <Icon name="chat" />
          <AlertDescription>{historyError}</AlertDescription>
          <Button className="text-button" variant="link" onClick={() => router.replace("/chat")}>
            Back to conversations
          </Button>
        </Alert>
      ) : (
        <>
          <ConversationMessages messages={messages} busy={busy} />

          {error && (
            <Alert className="chat-error" variant="destructive">
              <AlertDescription>{error.message || "Could not complete that message."}</AlertDescription>
              <Button
                className="text-button"
                variant="link"
                onClick={clearError}
              >
                Dismiss
              </Button>
            </Alert>
          )}

          <MessageComposer
            onSend={sendText}
            disabled={!historyLoaded || !settings.loaded || !settings.configured || busy}
            placeholder={busy ? "myagent is thinking…" : "Message myagent…"}
            settingsControls={(
              <ModelSettingsControls
                models={settings.models}
                modelId={settings.modelId}
                onModelChange={settings.selectModel}
                controls={settings.modelControls}
                selections={settings.controlSelections}
                onControlChange={settings.selectModelControl}
                disabled={!settings.loaded || !settings.configured || busy}
              />
            )}
          />
        </>
      )}
    </section>
  );
}
