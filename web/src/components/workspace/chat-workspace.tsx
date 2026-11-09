"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  sessionListSchema,
  sessionSummarySchema,
  type SessionSummary,
} from "@/lib/chat-shape";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "./workspace-sidebar";

type WorkspaceValue = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  setActiveSession: (sessionId: string | null) => void;
  refreshSessions: () => Promise<void>;
  createSession: (firstMessage?: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  consumePendingMessage: (sessionId: string) => string | undefined;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useChatWorkspace(): WorkspaceValue {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error("useChatWorkspace must be used inside ChatWorkspace.");
  }
  return workspace;
}

async function responseError(response: Response): Promise<string> {
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
    // Keep the user-facing fallback below for non-JSON errors.
  }
  return "Something went wrong. Please try again.";
}

export function ChatWorkspace({ children }: { children: ReactNode }) {
  return <ChatWorkspaceShell>{children}</ChatWorkspaceShell>;
}

function ChatWorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pendingMessages = useRef(new Map<string, string>());
  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/signin");
      return;
    }
    if (!response.ok) throw new Error(await responseError(response));

    const result = sessionListSchema.safeParse(await response.json());
    if (!result.success) throw new Error("Could not read your conversations.");
    setSessions(result.data.sessions);
  }, [router]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve()
      .then(refreshSessions)
      .catch((reason: unknown) => {
        if (mounted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load your conversations.",
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshSessions]);

  const createSession = useCallback(
    async (firstMessage?: string) => {
      setError("");
      try {
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (response.status === 401) {
          router.replace("/signin");
          return false;
        }
        if (!response.ok) throw new Error(await responseError(response));

        const session = sessionSummarySchema.safeParse(await response.json());
        if (!session.success) throw new Error("Could not create a conversation.");
        setSessions((current) => [
          session.data,
          ...current.filter((item) => item.session_id !== session.data.session_id),
        ]);
        if (firstMessage) {
          pendingMessages.current.set(session.data.session_id, firstMessage);
        }
        router.push(`/chat/${session.data.session_id}`);
        return true;
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not create a conversation.",
        );
        return false;
      }
    },
    [router],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      setError("");
      try {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          method: "DELETE",
        });
        if (response.status === 401) {
          router.replace("/signin");
          return;
        }
        if (!response.ok) throw new Error(await responseError(response));
        setSessions((current) =>
          current.filter((session) => session.session_id !== sessionId),
        );
        pendingMessages.current.delete(sessionId);
        if (activeSessionId === sessionId) router.replace("/chat");
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not delete this conversation.",
        );
      }
    },
    [activeSessionId, router],
  );

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    setError("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (response.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!response.ok) throw new Error(await responseError(response));
      const session = sessionSummarySchema.safeParse(await response.json());
      if (!session.success) throw new Error("Could not rename this conversation.");
      setSessions((current) => current.map((item) =>
        item.session_id === sessionId ? session.data : item,
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rename this conversation.");
    }
  }, [router]);

  const consumePendingMessage = useCallback((sessionId: string) => {
    const message = pendingMessages.current.get(sessionId);
    pendingMessages.current.delete(sessionId);
    return message;
  }, []);

  const contextValue = useMemo(
    () => ({
      sessions,
      activeSessionId,
      setActiveSession,
      refreshSessions,
      createSession,
      deleteSession,
      consumePendingMessage,
    }),
    [sessions, activeSessionId, refreshSessions, createSession, deleteSession, consumePendingMessage],
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <SidebarProvider className="workspace-shell">
        <WorkspaceFrame
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={loading}
          error={error}
          clearError={() => setError("")}
          createSession={() => void createSession()}
          deleteSession={deleteSession}
          renameSession={renameSession}
        >{children}</WorkspaceFrame>
      </SidebarProvider>
    </WorkspaceContext.Provider>
  );
}

function WorkspaceFrame({
  children,
  sessions,
  activeSessionId,
  loading,
  error,
  clearError,
  createSession,
  deleteSession,
  renameSession,
}: {
  children: ReactNode;
  sessions: SessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  error: string;
  clearError: () => void;
  createSession: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <>
      <WorkspaceSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        loading={loading}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
      />

      <SidebarInset className="workspace-main">
        <header className="mobile-header">
          <SidebarTrigger className="icon-button" aria-label="Open navigation" />
          <span className="mobile-brand"><Icon name="leaf" /> myagent</span>
          <Button
            className="icon-button"
            variant="ghost"
            size="icon-sm"
            aria-label="New conversation"
            onClick={() => { setOpenMobile(false); createSession(); }}
          >
            <Icon name="plus" />
          </Button>
        </header>
        {error && (
          <Alert className="workspace-alert" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
            <Button variant="ghost" size="icon-sm" aria-label="Dismiss error" onClick={clearError}>
              <Icon name="close" />
            </Button>
          </Alert>
        )}
        {children}
      </SidebarInset>
    </>
  );
}
