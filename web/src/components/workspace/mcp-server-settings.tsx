"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Server = {
  id: string; name: string; transport: "http"; url: string; enabled: boolean;
  built_in: false; token_configured?: boolean; token?: string; clear_token?: boolean;
};
type Settings = {
  builtin: { id: "searxng"; name: string; transport: "stdio"; url: string; enabled: boolean; built_in: true; description: string };
  servers: Server[];
};
const empty: Settings = {
  builtin: { id: "searxng", name: "SearXNG Web Search", transport: "stdio", url: "http://127.0.0.1:8080", enabled: true, built_in: true, description: "Private web search and URL reading using the local SearXNG service." },
  servers: [],
};

export function MCPServerSettings() {
  const [settings, setSettings] = useState<Settings>(empty);
  const [draft, setDraft] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void fetch("/api/mcp-servers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load MCP settings.");
      const data = await response.json() as Settings;
      if (active) { setSettings(data); setLoaded(true); setError(""); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load MCP settings.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  function retryLoad() {
    setError("");
    setBusy(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function save(next: Settings) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/mcp-servers", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          builtin_enabled: next.builtin.enabled,
          servers: next.servers.map(({ id, name, transport, url, enabled, built_in, token, clear_token }) => ({
            id, name, transport, url, enabled, built_in, token, clear_token,
          })),
        }),
      });
      const result = await response.json() as Settings | { detail?: string };
      if (!response.ok) throw new Error("detail" in result && typeof result.detail === "string" ? result.detail : "Could not save MCP settings.");
      setSettings(result as Settings); setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save MCP settings.");
    } finally { setSaving(false); }
  }

  function toggleBuiltIn() {
    const next = { ...settings, builtin: { ...settings.builtin, enabled: !settings.builtin.enabled } };
    setSettings(next); void save(next);
  }
  function toggleServer(server: Server) {
    const next = { ...settings, servers: settings.servers.map((item) => item.id === server.id ? { ...item, enabled: !item.enabled } : item) };
    setSettings(next); void save(next);
  }
  function editServer(server?: Server) {
    setDraft(server ? { ...server, token: "", clear_token: false } : {
      id: "", name: "", transport: "http", url: "", enabled: true, built_in: false, token: "", clear_token: false,
    });
  }
  function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const id = draft.id || "mcp-" + crypto.randomUUID();
    const next = { ...settings, servers: settings.servers.some((server) => server.id === id)
      ? settings.servers.map((server) => server.id === id ? { ...draft, id } : server)
      : [...settings.servers, { ...draft, id }] };
    void save(next);
  }
  function remove(server: Server) {
    void save({ ...settings, servers: settings.servers.filter((item) => item.id !== server.id) });
  }
  async function checkConnection(server: Server) {
    setChecking(server.id); setCheckResult((current) => ({ ...current, [server.id]: "Checking connection…" }));
    try {
      const response = await fetch("/api/mcp-servers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server_id: server.id }) });
      const result = await response.json() as { ok?: boolean; tool_count?: number; message?: string; detail?: string };
      setCheckResult((current) => ({ ...current, [server.id]: response.ok && result.ok ? `Connected · ${result.tool_count ?? 0} tools found` : result.message ?? result.detail ?? "Could not check this connection." }));
    } catch { setCheckResult((current) => ({ ...current, [server.id]: "Could not check this connection. Try again." })); }
    finally { setChecking(null); }
  }

  return <section className="flex flex-col gap-6" aria-labelledby="mcp-settings-heading">
    <header className="[&_h3]:m-0 [&_h3]:text-[13px] [&_h3]:font-[550] [&_p]:m-[4px_0_0] flex flex-wrap justify-between [&_h2]:m-0 [&_h3]:text-foreground [&_h2]:text-foreground [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:max-w-155 [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[1.6] items-end gap-4.5 mb-1.5 max-[560px]:items-start max-[560px]:flex-col max-[560px]:*:data-[slot=button]:w-full">
      <div><h2 id="mcp-settings-heading">MCP servers</h2><p>Connect agent tools through MCP. Built-in SearXNG can be disabled, while custom servers can be added and managed here.</p></div>
      <Button type="button" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary" disabled={!loaded || busy || saving} onClick={() => editServer()}>＋ Add server</Button>
    </header>
    {error && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] text-destructive" role="alert">{error}</p>{!loaded && <Button type="button" variant="outline" onClick={retryLoad}>Retry MCP settings</Button>}</div>}
    {!loaded && !error ? <p className="p-[18px_0] text-[11px] text-muted-foreground" role="status" aria-label="Loading MCP settings">Loading MCP settings…</p> : loaded ? <>
      <article className={"provider-row  flex items-center justify-between gap-5 min-h-16.5 p-[12px_0] border-b border-border max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2.5 min-h-19.5 border-border" + (!settings.builtin.enabled ? "is-disabled" : "")}>
        <div className="[.provider-row.is-disabled_&]:opacity-[.55] grid min-w-0 gap-1 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_strong]:text-foreground [&_strong]:text-[13px] [&_strong]:font-semibold [&_>_span]:text-muted-foreground [&_>_span]:text-[12px] [&_small]:text-muted-foreground [&_small]:text-[11px]"><strong>{settings.builtin.name} <small>Built in</small></strong><span>{settings.builtin.description}</span><small>{settings.builtin.url} · STDIO</small></div>
        <div className="flex flex-[0_0_auto] items-center gap-2 max-[760px]:w-full max-[760px]:flex-wrap"><label className="relative inline-flex w-8.5 h-5 items-center [&_input]:absolute [&_input]:w-full [&_input]:h-full [&_input]:m-0 [&_input]:opacity-[0] [&_input]:cursor-pointer [&_>_span]:w-8.5 [&_>_span]:h-4.5 [&_>_span]:rounded-full [&_>_span]:transition-[background_.15s] [&_>_span::after]:block [&_>_span::after]:w-3 [&_>_span::after]:h-3 [&_>_span::after]:m-0.75 [&_>_span::after]:rounded-full [&_>_span::after]:content-[''] [&_>_span::after]:transition-[transform_.15s,background_.15s] [&_input:checked+span::after]:transform-[translateX(16px)] [&_input:focus-visible+span]:outline-2 outline-ring [&_input:focus-visible+span]:outline-offset-2 [&_input:disabled]:cursor-wait [&_>_span]:bg-muted-foreground [&_>_span::after]:bg-background [&_input:checked+span]:bg-muted-foreground [&_input:checked+span::after]:bg-background [&_input:focus-visible+span]:outline-ring"><input type="checkbox" role="switch" checked={settings.builtin.enabled} disabled={saving} onChange={toggleBuiltIn} aria-label={(settings.builtin.enabled ? "Disable" : "Enable") + " SearXNG"} /><span aria-hidden="true" /></label></div>
      </article>
      {settings.servers.length === 0 && <p className="p-[18px_0] text-[11px] text-muted-foreground">No custom MCP servers yet.</p>}
      {settings.servers.map((server) => <article className={"provider-row  flex items-center justify-between gap-5 min-h-16.5 p-[12px_0] border-b border-border max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2.5 min-h-19.5 border-border" + (!server.enabled ? "is-disabled" : "")} key={server.id}>
        <div className="[.provider-row.is-disabled_&]:opacity-[.55] grid min-w-0 gap-1 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_strong]:text-foreground [&_strong]:text-[13px] [&_strong]:font-semibold [&_>_span]:text-muted-foreground [&_>_span]:text-[12px] [&_small]:text-muted-foreground [&_small]:text-[11px]"><strong>{server.name}</strong><span>{server.url}</span><small>Streamable HTTP{server.token_configured ? " · Authentication configured" : ""}</small></div>
        <div className="flex flex-[0_0_auto] items-center gap-2 max-[760px]:w-full max-[760px]:flex-wrap"><label className="relative inline-flex w-8.5 h-5 items-center [&_input]:absolute [&_input]:w-full [&_input]:h-full [&_input]:m-0 [&_input]:opacity-[0] [&_input]:cursor-pointer [&_>_span]:w-8.5 [&_>_span]:h-4.5 [&_>_span]:rounded-full [&_>_span]:transition-[background_.15s] [&_>_span::after]:block [&_>_span::after]:w-3 [&_>_span::after]:h-3 [&_>_span::after]:m-0.75 [&_>_span::after]:rounded-full [&_>_span::after]:content-[''] [&_>_span::after]:transition-[transform_.15s,background_.15s] [&_input:checked+span::after]:transform-[translateX(16px)] [&_input:focus-visible+span]:outline-2 outline-ring [&_input:focus-visible+span]:outline-offset-2 [&_input:disabled]:cursor-wait [&_>_span]:bg-muted-foreground [&_>_span::after]:bg-background [&_input:checked+span]:bg-muted-foreground [&_input:checked+span::after]:bg-background [&_input:focus-visible+span]:outline-ring"><input type="checkbox" role="switch" checked={server.enabled} disabled={saving} onChange={() => toggleServer(server)} aria-label={(server.enabled ? "Disable" : "Enable") + " " + server.name} /><span aria-hidden="true" /></label>
          <Button type="button" variant="ghost" className="min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground" disabled={saving || checking !== null} onClick={() => void checkConnection(server)}>{checking === server.id ? "Checking…" : "Check connection"}</Button>
          <Button type="button" variant="ghost" className="min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground" disabled={saving || checking !== null} aria-label={`Edit ${server.name}`} onClick={() => editServer(server)}>Edit</Button>
          <Button type="button" variant="ghost" className="danger min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground [&.danger]:text-destructive [&.danger:hover]:text-destructive" disabled={saving} onClick={() => setDeleteTarget(server)}>Delete</Button>
        </div>
        {checkResult[server.id] && <p role="status" className="basis-full text-xs text-muted-foreground">{checkResult[server.id]}</p>}
      </article>)}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this MCP server?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteTarget?.name ?? ""}” from your MCP settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteTarget) remove(deleteTarget); setDeleteTarget(null); }}>Delete server</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {draft && <form className="grid gap-3 p-4 border border-border [&_h3]:m-0 [&_h3]:text-[13px] [&_textarea]:w-full [&_textarea]:p-[9px_10px] [&_textarea]:border [&_textarea]:border-border [&_textarea]:rounded-md [&_textarea]:font-[inherit] [&_textarea]:text-[12px] [&_textarea]:resize-y rounded-xl bg-muted [&_textarea]:bg-background [&_textarea]:text-foreground" onSubmit={submitDraft}>
        <h3>{draft.id ? "Edit MCP server" : "Add MCP server"}</h3>
        <Field><FieldLabel htmlFor="mcp-name">Name</FieldLabel><Input id="mcp-name" required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="mcp-url">Streamable HTTP endpoint</FieldLabel><Input id="mcp-url" required type="url" maxLength={2048} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://mcp.example.com/mcp" autoComplete="url" spellCheck={false} /><FieldDescription>Endpoint connections are made by the server. Use only MCP servers you trust.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="mcp-token">Bearer token</FieldLabel><Input id="mcp-token" type="password" maxLength={4096} autoComplete="new-password" value={draft.token || ""} onChange={(event) => setDraft({ ...draft, token: event.target.value, clear_token: false })} placeholder={draft.token_configured ? "Saved token · leave blank to keep" : "Optional"} /></Field>
        {draft.token_configured && <label className="flex items-center gap-2 text-[12px] text-muted-foreground"><input type="checkbox" checked={draft.clear_token} onChange={(event) => setDraft({ ...draft, clear_token: event.target.checked })} /><span>Remove the saved token</span></label>}
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary" disabled={saving || !draft.name.trim() || !draft.url.trim()}>Save server</Button></div>
      </form>}
    </> : null}
  </section>;
}
