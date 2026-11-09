"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { areModelControlsValid, ModelControlEditor } from "@/components/workspace/model-control-editor";
import type { ModelControl, ModelProvider } from "@/lib/chat-shape";

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

type ModelOption = { id: string; name: string; alias?: string };
type UserSettingsPageProps = {
  providers: ModelProvider[];
  activeProviderId: string | null;
  models: ModelOption[];
  onSaved: () => Promise<void>;
  onSignOut: () => void;
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
  onSaved,
  onSignOut,
}: UserSettingsPageProps) {
  const [section, setSection] = useState<"account" | "connections">("connections");
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
      setPendingDeleteId(null);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this provider.");
    } finally {
      setBusyProviderId(null);
    }
  }

  return (
    <main className="user-settings-page">
      <aside className="user-settings-sidebar" aria-label="Settings navigation">
        <Link className="user-settings-back" href="/chat"><span aria-hidden="true">‹</span> Back to chat</Link>
        <div className="user-settings-nav-group">
          <span>Personal</span>
          <button type="button" aria-pressed={section === "account"} className={section === "account" ? "active" : ""} onClick={() => setSection("account")}><span aria-hidden="true">◉</span> Account</button>
        </div>
        <div className="user-settings-nav-group">
          <span>Preferences</span>
          <button type="button" aria-pressed={section === "connections"} className={section === "connections" ? "active" : ""} onClick={() => setSection("connections")}><span aria-hidden="true">⌁</span> Connections</button>
        </div>
      </aside>
      <div className="user-settings-main">
        <header className="user-settings-page-header"><h1>{section === "account" ? "Account" : "Connections"}</h1></header>
        <div className="user-settings-content">
          {section === "account" ? (
            <section className="user-settings-account" aria-labelledby="account-settings-heading">
              <div><h3 id="account-settings-heading">Account</h3><p>Your conversations and provider settings are saved to this account.</p></div>
              <div className="user-settings-account-card"><span className="account-avatar" aria-hidden="true">M</span><div><strong>MyAgent account</strong><span>Private workspace</span></div></div>
              <Separator />
              <div className="user-settings-security"><div><strong>Sign out</strong><span>End your current session on this device.</span></div><Button type="button" variant="outline" className="settings-secondary" onClick={onSignOut}>Sign out</Button></div>
            </section>
          ) : (
            <section className="user-settings-models" aria-labelledby="connections-heading">
              <header className="user-settings-section-title">
                <div><h2 id="connections-heading">OpenAI-compatible API</h2><p>Manage your personal model connections. Select an enabled provider to use it in chat.</p></div>
                <Button type="button" className="settings-primary" onClick={addProvider}>＋ Add connection</Button>
              </header>

              <div className="provider-list" aria-label="Saved model connections">
                {providers.length === 0 ? <p className="provider-empty">No connections yet. Add an OpenAI-compatible endpoint to get started.</p> : providers.map((provider) => {
                  const active = provider.id === activeProviderId;
                  return (
                    <article className={`provider-row ${active ? "is-active" : ""} ${!provider.enabled ? "is-disabled" : ""}`} key={provider.id}>
                      <div className="provider-row-copy"><strong>{provider.name}</strong><span>{provider.base_url}</span><small>{provider.model_id}{active ? " · Used in chat" : ""}</small></div>
                      <div className="provider-row-actions">
                        <label className="provider-switch" title={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`}>
                          <input type="checkbox" role="switch" checked={provider.enabled} disabled={busyProviderId === provider.id} onChange={() => void toggleProvider(provider)} aria-label={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`} />
                          <span aria-hidden="true" />
                        </label>
                        {provider.enabled && !active && <Button type="button" variant="outline" className="settings-secondary" disabled={busyProviderId === provider.id} onClick={() => void activateProvider(provider.id)}>Use</Button>}
                        <Button type="button" variant="ghost" className="provider-text-button" disabled={busyProviderId === provider.id} onClick={() => editProvider(provider)}>Edit</Button>
                        {pendingDeleteId === provider.id ? (
                          <span className="provider-delete-confirm"><span>Remove?</span><Button type="button" variant="ghost" className="provider-text-button" disabled={busyProviderId === provider.id} onClick={() => setPendingDeleteId(null)}>Cancel</Button><Button type="button" variant="ghost" className="provider-text-button danger" disabled={busyProviderId === provider.id} onClick={() => void deleteProvider(provider.id)}>Remove</Button></span>
                        ) : <Button type="button" variant="ghost" className="provider-text-button danger" disabled={busyProviderId === provider.id} onClick={() => setPendingDeleteId(provider.id)}>Remove</Button>}
                      </div>
                    </article>
                  );
                })}
              </div>

              <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="provider-dialog">
                  <DialogHeader>
                    <DialogTitle>{editingProviderId ? "Manage connection" : "Add a connection"}</DialogTitle>
                    <DialogDescription>Connect any OpenAI-compatible provider, including Ollama and llama.cpp.</DialogDescription>
                  </DialogHeader>
                  <section className="provider-editor" aria-label="Provider connection details">
                  <FieldGroup className="model-settings-form">
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
                  {editingProvider?.api_key_configured && <label className="model-settings-checkbox"><input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} /><span>Remove the saved API key</span></label>}
                  <Button type="button" variant="outline" className="settings-secondary model-settings-discover" disabled={busy || !baseUrl.trim()} onClick={() => void discoverModels()}>{busyAction === "discover" ? "Checking connection…" : "Load models"}</Button>
                  {models.length > 0 && (
                    <FieldGroup className="model-settings-form model-settings-choices">
                      <Field><FieldLabel htmlFor="default-model">Model</FieldLabel><select id="default-model" value={modelId} onChange={(event) => { const nextModel = event.target.value; setModelId(nextModel); setModelControls(editingProvider?.model_controls[nextModel] ?? defaultControls()); }}>{models.map((model) => <option key={model.id} value={model.id}>{model.alias || model.name || model.id}</option>)}</select></Field>
                      <ModelControlEditor controls={modelControls} onChange={setModelControls} />
                    </FieldGroup>
                  )}
                  {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                    <div className="model-settings-actions">
                      <Button type="button" variant="outline" className="settings-secondary" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button>
                      <Button type="button" className="settings-primary" disabled={busy || !providerName.trim() || !baseUrl.trim() || !modelId || models.length === 0 || !areModelControlsValid(modelControls)} onClick={() => void saveProvider()}>
                        {busyAction === "save" ? "Saving connection…" : "Save connection"}
                      </Button>
                    </div>
                  </section>
                </DialogContent>
              </Dialog>
              {error && !formOpen && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
