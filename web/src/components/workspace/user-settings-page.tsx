"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Cable, Sparkles, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { areModelControlsValid, ModelControlEditor } from "@/components/workspace/model-control-editor";
import { handleTabListKeyDown } from "@/lib/tab-keyboard";
import type { ModelControl, ModelProvider } from "@/lib/chat-shape";

const AgentLibrarySettings = dynamic(
  () => import("@/components/workspace/agent-library-settings").then((module) => module.AgentLibrarySettings),
  { loading: () => <SettingsPanelLoading /> },
);
const MCPServerSettings = dynamic(
  () => import("@/components/workspace/mcp-server-settings").then((module) => module.MCPServerSettings),
  { loading: () => <SettingsPanelLoading /> },
);

function SettingsPanelLoading() {
  return <div className="min-h-24 animate-pulse rounded-xl border border-border bg-muted/30" role="status" aria-label="Loading settings" />;
}

const catalogSchema = z.object({
  models: z.array(z.object({ id: z.string(), name: z.string(), alias: z.string().optional() })),
});
const CONNECTION_PRESETS = [
  { id: "openai", name: "OpenAI API", baseUrl: "https://api.openai.com/v1" },
  { id: "ollama", name: "Ollama API", baseUrl: "http://localhost:11434/v1" },
  { id: "groq", name: "Groq API", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", name: "OpenRouter API", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "lm-studio", name: "LM Studio API", baseUrl: "http://localhost:1234/v1" },
  { id: "llama-cpp", name: "llama.cpp API", baseUrl: "http://localhost:8080/v1" },
] as const;
const CUSTOM_CONNECTION = "custom";
type SettingsSection = "account" | "connections" | "agent-library";

const SETTINGS_SECTION_LABELS = {
  account: "Account",
  connections: "Connections",
  "agent-library": "Plugin",
} as const;

const SETTINGS_NAVIGATION: { group: string; items: { id: SettingsSection; label: string; icon: typeof UserRound }[] }[] = [
  { group: "Personal", items: [{ id: "account", label: "Account", icon: UserRound }] },
  {
    group: "Preferences",
    items: [
      { id: "connections", label: "Connections", icon: Cable },
      { id: "agent-library", label: "Plugin", icon: Sparkles },
    ],
  },
];

function SettingsNavigation({
  selectedSection,
  onSelect,
}: {
  selectedSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <aside className="flex flex-col min-h-dvh border-r border-border max-[760px]:min-h-0 max-[760px]:flex-row max-[760px]:flex-wrap max-[760px]:p-3 max-[760px]:border-r-0 max-[760px]:border-b gap-7 p-[24px_14px] bg-background max-[760px]:gap-3 max-[560px]:gap-2.5 max-[560px]:p-3" aria-label="Settings navigation">
      <Link className="flex items-center gap-2 p-[0_8px] text-[12px] no-underline [&_span]:text-[18px] [&_span]:leading-none max-[760px]:w-full min-h-9 text-muted-foreground [&:hover]:text-foreground" href="/chat">
        <ArrowLeft aria-hidden="true" />
        Back to chat
      </Link>
      <ThemeToggle />
      {SETTINGS_NAVIGATION.map(({ group, items }) => (
        <div className="flex flex-col [&_>_span]:m-[0_8px_5px] [&_>_span]:text-[10px] [&_button]:flex [&_button]:items-center [&_button]:gap-2.25 [&_button]:p-[0_9px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:cursor-pointer [&_button]:text-left [&_button]:font-[inherit] [&_button]:text-[12px] [&_button_>_span]:w-3.75 [&_button_>_span]:text-muted-foreground [&_button_>_span]:text-[14px] [&_button_>_span]:text-center max-[760px]:flex-row max-[760px]:items-center max-[760px]:gap-1.5 max-[760px]:[&_>_span]:m-[0_2px_0_0] gap-1 [&_>_span]:text-muted-foreground [&_>_span]:font-[650] [&_>_span]:tracking-[.08em] [&_>_span]:uppercase [&_button]:min-h-10 [&_button]:rounded-md [&_button]:text-muted-foreground [&_button:hover]:bg-accent [&_button:hover]:text-foreground [&_button_>_svg]:w-4 [&_button_>_svg]:h-4 [&_button_>_svg]:flex-[0_0_16px] [&_button_>_svg]:text-muted-foreground max-[760px]:[&_button]:min-h-9 max-[560px]:flex-wrap max-[560px]:[&_>_span]:w-full max-[560px]:[&_>_span]:m-[0_2px_3px]" key={group}>
          <span>{group}</span>
          {items.map(({ id, label, icon: Icon }) => (
            <button
              aria-pressed={selectedSection === id}
              className={selectedSection === id ? "bg-accent font-semibold text-foreground" : ""}
              key={id}
              onClick={() => onSelect(id)}
              type="button"
            >
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

type ModelOption = { id: string; name: string; alias?: string };
type UserSettingsPageProps = {
  providers: ModelProvider[];
  activeProviderId: string | null;
  models: ModelOption[];
  settingsLoaded: boolean;
  settingsError: string;
  onSaved: () => Promise<void>;
  onSignOut: () => void;
};

type ChatGPTPlanStatus = {
  connected: boolean;
  email: string | null;
  provider_id: string | null;
  enabled: boolean;
  manage_usage_url: string;
};

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || !("detail" in payload)) {
      return fallback;
    }
    const detail = payload.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail.flatMap((issue) => {
        if (typeof issue !== "object" || issue === null) return [];
        const message = "msg" in issue && typeof issue.msg === "string" ? issue.msg : null;
        if (!message) return [];
        const location = "loc" in issue && Array.isArray(issue.loc)
          ? issue.loc.filter((part: unknown) => part !== "body").join(" → ")
          : "";
        return [location ? `${location}: ${message}` : message];
      });
      if (messages.length) return messages.join("; ");
    }
    if (typeof detail === "object" && detail !== null && "message" in detail && typeof detail.message === "string") {
      return detail.message;
    }
  } catch {
    // Use the caller's fallback for non-JSON errors.
  }
  return fallback;
}

export function UserSettingsPage({
  providers,
  activeProviderId,
  models: activeModels,
  settingsLoaded,
  settingsError,
  onSaved,
  onSignOut,
}: UserSettingsPageProps) {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>("connections");
  const [agentSettingsTab, setAgentSettingsTab] = useState<"library" | "mcp">("library");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<string>(CONNECTION_PRESETS[0].id);
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("default");
  const [modelControls, setModelControls] = useState<ModelControl[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"discover" | "save" | null>(null);
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteProviderTarget, setDeleteProviderTarget] = useState<ModelProvider | null>(null);
  const [confirmDeleteSessions, setConfirmDeleteSessions] = useState(false);
  const deleteSessionsTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteSessionsRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingDeleteSessionsRef = useRef(false);
  const [deletingSessions, setDeletingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [chatGPTPlan, setChatGPTPlan] = useState<ChatGPTPlanStatus | null>(null);
  const [chatGPTPlanLoading, setChatGPTPlanLoading] = useState(true);
  const [chatGPTPlanBusy, setChatGPTPlanBusy] = useState(false);
  const [chatGPTPlanError, setChatGPTPlanError] = useState("");

  const refreshChatGPTPlan = async () => {
    setChatGPTPlanLoading(true);
    setChatGPTPlanError("");
    try {
      const response = await fetch("/api/chatgpt-plan", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not load ChatGPT plan status."));
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("connected" in result)) {
        throw new Error("Could not read ChatGPT plan status.");
      }
      setChatGPTPlan(result as ChatGPTPlanStatus);
      setChatGPTPlanError("");
    } catch (reason) {
      setChatGPTPlanError(reason instanceof Error ? reason.message : "Could not load ChatGPT plan status.");
    } finally {
      setChatGPTPlanLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshChatGPTPlan();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (confirmDeleteSessions) {
      wasConfirmingDeleteSessionsRef.current = true;
      cancelDeleteSessionsRef.current?.focus();
    } else if (wasConfirmingDeleteSessionsRef.current) {
      wasConfirmingDeleteSessionsRef.current = false;
      deleteSessionsTriggerRef.current?.focus();
    }
  }, [confirmDeleteSessions]);

  async function connectChatGPTPlan() {
    setChatGPTPlanBusy(true);
    setChatGPTPlanError("");
    try {
      const response = await fetch("/api/chatgpt-plan", { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not start ChatGPT sign-in."));
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("authorization_url" in result) || typeof result.authorization_url !== "string") {
        throw new Error("OpenAI returned an invalid sign-in link.");
      }
      window.location.assign(result.authorization_url);
    } catch (reason) {
      setChatGPTPlanError(reason instanceof Error ? reason.message : "Could not start ChatGPT sign-in.");
      setChatGPTPlanBusy(false);
    }
  }

  async function disconnectChatGPTPlan() {
    if (!chatGPTPlan?.provider_id) return;
    setChatGPTPlanBusy(true);
    setChatGPTPlanError("");
    try {
      const response = await fetch(`/api/model-providers/${chatGPTPlan.provider_id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not disconnect your ChatGPT plan."));
      await Promise.all([refreshChatGPTPlan(), onSaved()]);
    } catch (reason) {
      setChatGPTPlanError(reason instanceof Error ? reason.message : "Could not disconnect your ChatGPT plan.");
    } finally {
      setChatGPTPlanBusy(false);
    }
  }

  const editingProvider = providers.find((provider) => provider.id === editingProviderId);

  function defaultControls(): ModelControl[] {
    return [{ id: crypto.randomUUID(), name: "Thinking", parameter: "reasoning_effort", options: [{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }], default_value: null }];
  }

  function addProvider() {
    setEditingProviderId(null);
    setConnectionType(CONNECTION_PRESETS[0].id);
    setProviderName(CONNECTION_PRESETS[0].name);
    setBaseUrl(CONNECTION_PRESETS[0].baseUrl);
    setApiKey("");
    setClearApiKey(false);
    setModelId("");
    setEffort("default");
    setModelControls(defaultControls());
    setModels([]);
    setError("");
    setFormOpen(true);
  }

  function editProvider(provider: ModelProvider) {
    setEditingProviderId(provider.id);
    const preset = CONNECTION_PRESETS.find((item) => item.name === provider.name);
    setConnectionType(preset?.id ?? CUSTOM_CONNECTION);
    setProviderName(preset ? preset.name : provider.name);
    setBaseUrl(provider.base_url);
    setApiKey("");
    setClearApiKey(false);
    setModelId(provider.model_id);
    setEffort(provider.reasoning_effort);
    setModelControls(provider.model_controls[provider.model_id] ?? defaultControls());
    setModels(provider.id === activeProviderId ? activeModels : []);
    setError("");
    setFormOpen(true);
  }

  async function discoverModels() {
    setBusy(true);
    setBusyAction("discover");
    setError("");
    try {
      const response = await fetch("/api/model-settings/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          api_key: apiKey || null,
          ...(editingProviderId ? { provider_id: editingProviderId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not connect to that endpoint."));
      const result = catalogSchema.safeParse(await response.json());
      if (!result.success || result.data.models.length === 0) throw new Error("The endpoint returned no models.");
      setModels(result.data.models);
      if (!result.data.models.some((model) => model.id === modelId)) setModelId(result.data.models[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect to that endpoint.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function saveProvider() {
    setBusy(true);
    setBusyAction("save");
    setError("");
    try {
      const response = await fetch(
        editingProviderId ? `/api/model-providers/${editingProviderId}` : "/api/model-providers",
        {
          method: editingProviderId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: providerName,
            base_url: baseUrl,
            api_key: apiKey || null,
            clear_api_key: clearApiKey,
            model_id: modelId,
            reasoning_effort: effort,
            model_controls: modelControls,
            enabled: editingProvider?.enabled ?? true,
          }),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response, "Could not save this provider."));
      await onSaved();
      setFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this provider.");
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function toggleProvider(provider: ModelProvider) {
    setBusyProviderId(provider.id);
    setError("");
    try {
      const response = await fetch(`/api/model-providers/${provider.id}/enabled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not update this provider."));
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this provider.");
    } finally {
      setBusyProviderId(null);
    }
  }

  async function activateProvider(providerId: string) {
    setBusyProviderId(providerId);
    setError("");
    try {
      const response = await fetch("/api/model-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not select this provider."));
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not select this provider.");
    } finally {
      setBusyProviderId(null);
    }
  }

  async function deleteProvider(providerId: string) {
    setBusyProviderId(providerId);
    setError("");
    try {
      const response = await fetch(`/api/model-providers/${providerId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not remove this provider."));
      setDeleteProviderTarget(null);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this provider.");
    } finally {
      setBusyProviderId(null);
    }
  }

  async function deleteAllSessions() {
    setDeletingSessions(true);
    setSessionsError("");
    try {
      const response = await fetch("/api/sessions", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Could not delete your conversations."));
      }
      setConfirmDeleteSessions(false);
      router.push("/chat");
    } catch (reason) {
      setSessionsError(reason instanceof Error ? reason.message : "Could not delete your conversations.");
    } finally {
      setDeletingSessions(false);
    }
  }

  return (
    <main className="user-settings-page grid w-full min-h-dvh max-[760px]:grid-cols-[1fr] grid-cols-[248px_minmax(0,1fr)] bg-background text-foreground **:data-[slot=field-label]:text-muted-foreground **:data-[slot=field-label]:text-[12px] **:data-[slot=input]:border-input **:data-[slot=input]:bg-background **:data-[slot=input]:text-foreground [&_[data-slot=input]::placeholder]:text-muted-foreground **:data-[slot=alert]:border-destructive/30 **:data-[slot=alert]:bg-destructive/10 **:data-[slot=field-description]:text-muted-foreground **:data-[slot=field-description]:text-[11px] **:data-[slot=separator]:bg-muted">
      <SettingsNavigation selectedSection={section} onSelect={setSection} />
      <div className="min-w-0 p-[36px_48px_64px] max-[760px]:p-[24px_20px_42px] max-[560px]:p-[20px_16px_34px]">
        <header className="[&_h1]:m-0 m-[0_0_34px] pb-5 border-b border-border [&_h1]:text-foreground [&_h1]:text-[28px] [&_h1]:font-[620] [&_h1]:tracking-[-.045em] max-[760px]:mb-6 max-[760px]:[&_h1]:text-[25px]"><h1>{SETTINGS_SECTION_LABELS[section]}</h1></header>
        <div className="min-w-0 w-[min(100%,960px)]">
          {section === "account" ? (
            <section className="flex flex-col [&_h2]:m-0 [&_p]:m-[4px_0_0] gap-6 [&_h2]:text-foreground [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:max-w-155 [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[1.6]" aria-labelledby="account-settings-heading">
              <div><h2 id="account-settings-heading">Account</h2><p>Your conversations and provider settings are saved to this account.</p></div>
              <div className="user-settings-account-card flex items-center [&_>_div]:grid [&_>_div]:gap-0.75 [&_strong]:font-[550] gap-3.5 p-4.5 border border-border rounded-xl bg-background [&_strong]:text-foreground [&_strong]:text-[13px]"><span className="grid place-items-center w-8.5 h-8.5 border border-border rounded-full bg-muted text-muted-foreground text-[12px] font-[650] [.dark_.workspace-shell_&]:border-sidebar-border [.dark_.workspace-shell_&]:bg-sidebar-accent [.dark_.workspace-shell_&]:text-sidebar-foreground [.user-settings-account-card_span:not(&)]:text-muted-foreground [.user-settings-account-card_span:not(&)]:text-[12px]" aria-hidden="true">M</span><div><strong>MyAgent account</strong><span>Private workspace</span></div></div>
              <Separator />
              <div className="[&_strong]:font-[550] flex items-center justify-between gap-3 [&_>_div]:grid [&_>_div]:gap-1 [&_strong]:text-foreground [&_strong]:text-[13px] [&_span]:text-muted-foreground [&_span]:text-[12px]">
                <div><strong>Delete all conversations</strong><span>Permanently remove every conversation saved to this account.</span></div>
                {confirmDeleteSessions ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px] max-[760px]:flex-wrap"
                    role="group"
                    aria-label="Delete all conversations confirmation"
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && !deletingSessions) {
                        event.preventDefault();
                        setConfirmDeleteSessions(false);
                      }
                    }}
                  >
                    <span className="sr-only" role="status">Confirm permanent deletion of all conversations.</span>
                    <span>Delete all?</span>
                    <Button ref={cancelDeleteSessionsRef} type="button" variant="ghost" className="min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground" disabled={deletingSessions} onClick={() => setConfirmDeleteSessions(false)}>Cancel</Button>
                    <Button type="button" variant="ghost" className="danger min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground [&.danger]:text-destructive [&.danger:hover]:text-destructive" disabled={deletingSessions} onClick={() => void deleteAllSessions()}>{deletingSessions ? "Deleting…" : "Delete all"}</Button>
                  </span>
                ) : (
                  <Button ref={deleteSessionsTriggerRef} type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" disabled={deletingSessions} onClick={() => { setSessionsError(""); setConfirmDeleteSessions(true); }}>Delete all</Button>
                )}
              </div>
              {sessionsError ? <Alert className="flex flex-wrap items-center justify-between gap-3" variant="destructive"><AlertDescription>{sessionsError}</AlertDescription><Button type="button" variant="outline" disabled={deletingSessions} onClick={() => void deleteAllSessions()}>Retry delete all conversations</Button></Alert> : null}
              <Separator />
              <div className="[&_strong]:font-[550] flex items-center justify-between gap-3 [&_>_div]:grid [&_>_div]:gap-1 [&_strong]:text-foreground [&_strong]:text-[13px] [&_span]:text-muted-foreground [&_span]:text-[12px]"><div><strong>Sign out</strong><span>End your current session on this device.</span></div><Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" onClick={onSignOut}>Sign out</Button></div>
            </section>
          ) : section === "connections" ? (
            <section className="flex flex-col gap-6" aria-labelledby="connections-heading">
              <header className="[&_h3]:m-0 [&_h3]:text-[13px] [&_h3]:font-[550] [&_p]:m-[4px_0_0] flex flex-wrap justify-between [&_h2]:m-0 [&_h3]:text-foreground [&_h2]:text-foreground [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:max-w-155 [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[1.6] items-end gap-4.5 mb-1.5 max-[560px]:items-start max-[560px]:flex-col max-[560px]:*:data-[slot=button]:w-full">
                <div><h2 id="connections-heading">OpenAI-compatible API</h2><p>Manage your personal model connections. Select an enabled provider to use it in chat.</p></div>
                <Button type="button" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary" onClick={addProvider}>＋ Add connection</Button>
              </header>

              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4" aria-label="ChatGPT plan connection">
                <div className="grid gap-1">
                  <strong className="text-[13px] font-semibold text-foreground">Use your ChatGPT plan</strong>
                  <span className="text-[12px] text-muted-foreground">Sign in with OpenAI to use an eligible ChatGPT plan in this local app.</span>
                  {chatGPTPlan?.connected && <span className="text-[12px] text-muted-foreground">Connected{chatGPTPlan.email ? " as " + chatGPTPlan.email : ""}{chatGPTPlan.enabled ? "" : " · disabled"}</span>}
                  {chatGPTPlanLoading && <span className="text-[12px] text-muted-foreground" role="status" aria-label="Loading ChatGPT plan status">Checking ChatGPT connection…</span>}
                  <a className="text-[12px] text-muted-foreground underline underline-offset-4 hover:text-foreground" href={chatGPTPlan?.manage_usage_url ?? "https://chatgpt.com/settings/usage"} target="_blank" rel="noreferrer">Manage ChatGPT usage</a>
                </div>
                {chatGPTPlan?.connected ? (
                  <Button type="button" variant="outline" disabled={chatGPTPlanBusy} onClick={() => void disconnectChatGPTPlan()}>{chatGPTPlanBusy ? "Disconnecting…" : "Disconnect"}</Button>
                ) : (
                  <Button type="button" disabled={chatGPTPlanBusy || chatGPTPlan === null} onClick={() => void connectChatGPTPlan()}>{chatGPTPlanBusy ? "Connecting…" : "Continue with ChatGPT"}</Button>
                )}
                {chatGPTPlanError && <Alert className="w-full" variant="destructive"><AlertDescription>{chatGPTPlanError}</AlertDescription><Button className="mt-2" type="button" variant="outline" disabled={chatGPTPlanLoading} onClick={() => void refreshChatGPTPlan()}>Retry ChatGPT status</Button></Alert>}
              </section>

              <div className="flex flex-col" aria-label="Saved model connections">
                {!settingsLoaded ? (
                  <div className="flex items-center gap-3 py-4" role="status" aria-label="Loading connections">
                    <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden="true" />
                    <span className="text-[12px] text-muted-foreground">Loading connections…</span>
                  </div>
                ) : settingsError ? (
                  <Alert className="flex flex-wrap items-center justify-between gap-3" variant="destructive">
                    <AlertDescription>{settingsError}</AlertDescription>
                    <Button type="button" variant="outline" onClick={() => void onSaved()}>Retry settings</Button>
                  </Alert>
                ) : providers.length === 0 ? <p className="p-[18px_0] text-[11px] text-muted-foreground">No connections yet. Add an OpenAI-compatible endpoint to get started.</p> : providers.map((provider) => {
                  const active = provider.id === activeProviderId;
                  return (
                    <article className={`provider-row flex min-h-19.5 items-center justify-between gap-5 border-b border-border py-3 max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2.5 ${active ? "border-l-2 border-border pl-2.5" : ""} ${!provider.enabled ? "is-disabled" : ""}`} key={provider.id}>
                      <div className="[.provider-row.is-disabled_&]:opacity-[.55] grid min-w-0 gap-1 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_strong]:text-foreground [&_strong]:text-[13px] [&_strong]:font-semibold [&_>_span]:text-muted-foreground [&_>_span]:text-[12px] [&_small]:text-muted-foreground [&_small]:text-[11px]"><strong>{provider.name}</strong><span>{provider.base_url}</span><small>{provider.model_id}{active ? " · Used in chat" : ""}</small></div>
                      <div className="flex flex-[0_0_auto] items-center gap-2 max-[760px]:w-full max-[760px]:flex-wrap">
                        <label className="relative inline-flex w-8.5 h-5 items-center [&_input]:absolute [&_input]:w-full [&_input]:h-full [&_input]:m-0 [&_input]:opacity-[0] [&_input]:cursor-pointer [&_>_span]:w-8.5 [&_>_span]:h-4.5 [&_>_span]:rounded-full [&_>_span]:transition-[background_.15s] [&_>_span::after]:block [&_>_span::after]:w-3 [&_>_span::after]:h-3 [&_>_span::after]:m-0.75 [&_>_span::after]:rounded-full [&_>_span::after]:content-[''] [&_>_span::after]:transition-[transform_.15s,background_.15s] [&_input:checked+span::after]:transform-[translateX(16px)] [&_input:focus-visible+span]:outline-2 outline-ring [&_input:focus-visible+span]:outline-offset-2 [&_input:disabled]:cursor-wait [&_>_span]:bg-muted-foreground [&_>_span::after]:bg-background [&_input:checked+span]:bg-muted-foreground [&_input:checked+span::after]:bg-background [&_input:focus-visible+span]:outline-ring" title={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`}>
                          <input type="checkbox" role="switch" checked={provider.enabled} disabled={busyProviderId === provider.id} onChange={() => void toggleProvider(provider)} aria-label={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`} />
                          <span aria-hidden="true" />
                        </label>
                        {provider.enabled && !active && <Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" disabled={busyProviderId === provider.id} onClick={() => void activateProvider(provider.id)}>Use</Button>}
                        {provider.auth_type === "chatgpt_plan" ? null : <>
                        <Button type="button" variant="ghost" className="min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground" disabled={busyProviderId === provider.id} onClick={() => editProvider(provider)}>Edit</Button>
                        <Button type="button" variant="ghost" className="danger min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground [&.danger]:text-destructive [&.danger:hover]:text-destructive" disabled={busyProviderId === provider.id} onClick={() => setDeleteProviderTarget(provider)}>Remove</Button>
                        </>}
                      </div>
                    </article>
                  );
                })}
              </div>

              <AlertDialog open={deleteProviderTarget !== null} onOpenChange={(open) => { if (!open) setDeleteProviderTarget(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this connection?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes “{deleteProviderTarget?.name ?? ""}” and its saved configuration.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => { if (deleteProviderTarget) void deleteProvider(deleteProviderTarget.id); setDeleteProviderTarget(null); }}>Remove connection</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="provider-dialog w-[min(560px,calc(100vw-2rem))] max-w-[min(560px,calc(100vw-2rem))] max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto **:data-[slot=field-description]:text-[10px] border-border bg-background text-foreground shadow-xl **:data-[slot=dialog-title]:text-foreground **:data-[slot=dialog-description]:text-muted-foreground **:data-[slot=field-description]:text-muted-foreground **:data-[slot=field-label]:text-muted-foreground **:data-[slot=field-label]:text-[12px] **:data-[slot=input]:border-input **:data-[slot=input]:bg-background **:data-[slot=input]:text-foreground [&_[data-slot=input]::placeholder]:text-muted-foreground **:data-[slot=alert]:border-destructive/30 **:data-[slot=alert]:bg-destructive/10">
                  <DialogHeader>
                    <DialogTitle>{editingProviderId ? "Manage connection" : "Add a connection"}</DialogTitle>
                    <DialogDescription>Connect any OpenAI-compatible provider, including Ollama and llama.cpp.</DialogDescription>
                  </DialogHeader>
                  <section className="flex flex-col gap-4 mt-6 p-4.5 border border-border in-[.provider-dialog]:m-0 in-[.provider-dialog]:p-0 in-[.provider-dialog]:border-0 in-[.provider-dialog]:bg-transparent max-[760px]:p-3.5 rounded-xl bg-muted" aria-label="Provider connection details">
                  <FieldGroup className="gap-3.25 [&_select]:w-full [&_select]:h-9 [&_select]:p-[0_10px] [&_select]:border [&_select]:border-border [&_select]:rounded-md [&_select]:font-[inherit] [&_select]:text-[12px] [&_select]:bg-background [&_select]:text-foreground">
                    <Field>
                      <FieldLabel htmlFor="provider-type">Connection type</FieldLabel>
                      <select
                        id="provider-type"
                        value={connectionType}
                        onChange={(event) => {
                          const nextType = event.target.value;
                          setConnectionType(nextType);
                          const preset = CONNECTION_PRESETS.find((item) => item.id === nextType);
                          if (preset) {
                            setProviderName(preset.name);
                            setBaseUrl(preset.baseUrl);
                          } else {
                            setProviderName("");
                          }
                        }}
                      >
                        {CONNECTION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                        <option value={CUSTOM_CONNECTION}>Custom OpenAI-compatible API</option>
                      </select>
                      {connectionType === CUSTOM_CONNECTION && (
                        <>
                          <FieldLabel htmlFor="provider-name">Connection name</FieldLabel>
                          <Input id="provider-name" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="My server" />
                        </>
                      )}
                    </Field>
                    <Field><FieldLabel htmlFor="model-endpoint">API base URL</FieldLabel><Input id="model-endpoint" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="url" spellCheck={false} /><FieldDescription>For local servers, enter a URL such as http://localhost:8080/v1.</FieldDescription></Field>
                    <Field>
                      <FieldLabel htmlFor="model-api-key">API key</FieldLabel>
                      <Input id="model-api-key" type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); }} placeholder={editingProvider?.api_key_configured ? "Saved key · leave blank to keep" : "Optional for local servers"} autoComplete="new-password" />
                      <FieldDescription>{editingProvider?.api_key_configured ? "Enter a new key to replace the saved one. Saved keys are encrypted." : "Your provider may require a key. It is encrypted before being saved."}</FieldDescription>
                    </Field>
                  </FieldGroup>
                  {editingProvider?.api_key_configured && <label className="flex items-center gap-2 text-[12px] text-muted-foreground"><input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} /><span>Remove the saved API key</span></label>}
                  <Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent self-start" disabled={busy || !baseUrl.trim()} onClick={() => void discoverModels()}>{busyAction === "discover" ? "Checking connection…" : "Load models"}</Button>
                  {models.length > 0 && (
                    <FieldGroup className="[&_select]:w-full [&_select]:h-9 [&_select]:p-[0_10px] [&_select]:border [&_select]:border-border [&_select]:rounded-md [&_select]:font-[inherit] [&_select]:text-[12px] [&_select]:bg-background [&_select]:text-foreground grid-cols-[1.4fr_1fr] gap-3">
                      <Field><FieldLabel htmlFor="default-model">Model</FieldLabel><select id="default-model" value={modelId} onChange={(event) => { const nextModel = event.target.value; setModelId(nextModel); setModelControls(editingProvider?.model_controls[nextModel] ?? defaultControls()); }}>{models.map((model) => <option key={model.id} value={model.id}>{model.alias || model.name || model.id}</option>)}</select></Field>
                      <ModelControlEditor controls={modelControls} onChange={setModelControls} />
                    </FieldGroup>
                  )}
                  {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button>
                      <Button type="button" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary disabled:opacity-100 [.provider-dialog_[data-slot=button]&:disabled]:bg-muted [.provider-dialog_[data-slot=button]&:disabled]:text-foreground" disabled={busy || !providerName.trim() || !baseUrl.trim() || !modelId || models.length === 0 || !areModelControlsValid(modelControls)} onClick={() => void saveProvider()}>
                        {busyAction === "save" ? "Saving connection…" : "Save connection"}
                      </Button>
                    </div>
                  </section>
                </DialogContent>
              </Dialog>
              {error && !formOpen && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </section>
          ) : section === "agent-library" ? (
            <section className="flex flex-col gap-6" aria-label="Skills, Persona, and MCP settings">
              <div className="flex gap-1.5 border-b border-border [&_button]:p-[8px_12px] [&_button]:border-0 [&_button]:border-b-2 [&_button]:border-b-transparent [&_button]:bg-transparent [&_button]:cursor-pointer [&_button]:font-[inherit] [&_button]:text-[12px] [&_button]:text-muted-foreground [&_button[aria-selected=true]]:border-border [&_button[aria-selected=true]]:text-foreground" role="tablist" aria-label="Agent settings" onKeyDown={handleTabListKeyDown}>
                <button id="agent-plugin-tab" aria-controls="agent-settings-panel" tabIndex={agentSettingsTab === "library" ? 0 : -1} type="button" role="tab" aria-selected={agentSettingsTab === "library"} onClick={() => setAgentSettingsTab("library")}>Plugin</button>
                <button id="agent-mcp-tab" aria-controls="agent-settings-panel" tabIndex={agentSettingsTab === "mcp" ? 0 : -1} type="button" role="tab" aria-selected={agentSettingsTab === "mcp"} onClick={() => setAgentSettingsTab("mcp")}>MCP servers</button>
              </div>
              <div role="tabpanel" id="agent-settings-panel" aria-labelledby={agentSettingsTab === "library" ? "agent-plugin-tab" : "agent-mcp-tab"} tabIndex={0}>
                {agentSettingsTab === "library" ? <AgentLibrarySettings /> : <MCPServerSettings />}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
