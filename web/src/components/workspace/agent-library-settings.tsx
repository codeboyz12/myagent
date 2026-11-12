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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { handleTabListKeyDown } from "@/lib/tab-keyboard";

type Item = { id: string; name: string; description: string; content: string; enabled: boolean; built_in: boolean };
type Library = { skills: Item[]; personas: Item[] };
const emptyLibrary: Library = { skills: [], personas: [] };

export function AgentLibrarySettings() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [kind, setKind] = useState<"skills" | "personas">("skills");
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/agent-library", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load plugin settings.");
        const result = await response.json();
        if (active) { setLibrary(result); setLoaded(true); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load settings.");
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [loadAttempt]);

  function retryLoad() {
    setError("");
    setBusy(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function save(next: Library) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent-library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save settings.");
      setLibrary(result); setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  function update(item: Item) {
    const entries = library[kind];
    const nextEntries = entries.some((entry) => entry.id === item.id) ? entries.map((entry) => entry.id === item.id ? item : entry) : [...entries, item];
    void save({ ...library, [kind]: nextEntries });
  }
  function remove(item: Item) { void save({ ...library, [kind]: library[kind].filter((entry) => entry.id !== item.id) }); }

  const entries = library[kind];
  return <section className="flex flex-col gap-6" aria-labelledby="agent-library-heading">
    <header className="[&_h3]:m-0 [&_h3]:text-[13px] [&_h3]:font-[550] [&_p]:m-[4px_0_0] flex flex-wrap justify-between [&_h2]:m-0 [&_h3]:text-foreground [&_h2]:text-foreground [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:max-w-155 [&_p]:text-muted-foreground [&_p]:text-[13px] [&_p]:leading-[1.6] items-end gap-4.5 mb-1.5 max-[560px]:items-start max-[560px]:flex-col max-[560px]:*:data-[slot=button]:w-full"><div><h2 id="agent-library-heading">Plugin</h2><p>Choose what the agent can use, and add your own entries. Changes save automatically. Built-in entries can be disabled but not removed.</p></div>
      <Button type="button" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary" onClick={() => setEditing({ id: "", name: "", description: "", content: "", enabled: true, built_in: false })}>＋ Add {kind === "skills" ? "skill" : "persona"}</Button>
    </header>
    <div className="flex gap-1.5 border-b border-border [&_button]:p-[8px_12px] [&_button]:border-0 [&_button]:border-b-2 [&_button]:border-b-transparent [&_button]:bg-transparent [&_button]:cursor-pointer [&_button]:font-[inherit] [&_button]:text-[12px] [&_button]:text-muted-foreground [&_button[aria-selected=true]]:border-border [&_button[aria-selected=true]]:text-foreground" role="tablist" aria-label="Agent library type" onKeyDown={handleTabListKeyDown}>
      <button id="library-skills-tab" aria-controls="library-items-panel" tabIndex={kind === "skills" ? 0 : -1} type="button" role="tab" aria-selected={kind === "skills"} onClick={() => { setKind("skills"); setEditing(null); }}>Skills ({library.skills.length})</button>
      <button id="library-personas-tab" aria-controls="library-items-panel" tabIndex={kind === "personas" ? 0 : -1} type="button" role="tab" aria-selected={kind === "personas"} onClick={() => { setKind("personas"); setEditing(null); }}>Persona ({library.personas.length})</button>
    </div>
    <div role="tabpanel" id="library-items-panel" aria-labelledby={kind === "skills" ? "library-skills-tab" : "library-personas-tab"} tabIndex={0}>
    {error && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] text-destructive" role="alert">{error}</p>{!loaded && <Button type="button" variant="outline" onClick={retryLoad}>Retry Plugin settings</Button>}</div>}
    {!loaded && !error ? <p className="p-[18px_0] text-[11px] text-muted-foreground" role="status" aria-label="Loading Plugin settings">Loading Plugin settings…</p> : loaded ? entries.map((item) => <article className={`provider-row  flex items-center justify-between gap-5 min-h-16.5 p-[12px_0] border-b border-border max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2.5 min-h-19.5 border-border${!item.enabled ? "is-disabled" : ""}`} key={item.id}>
      <div className="[.provider-row.is-disabled_&]:opacity-[.55] grid min-w-0 gap-1 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap [&_strong]:text-foreground [&_strong]:text-[13px] [&_strong]:font-semibold [&_>_span]:text-muted-foreground [&_>_span]:text-[12px] [&_small]:text-muted-foreground [&_small]:text-[11px]"><strong>{item.name} {item.built_in && <small>Built in</small>}</strong><span>{item.description || item.id}</span></div>
      <div className="flex flex-[0_0_auto] items-center gap-2 max-[760px]:w-full max-[760px]:flex-wrap"><label className="relative inline-flex w-8.5 h-5 items-center [&_input]:absolute [&_input]:w-full [&_input]:h-full [&_input]:m-0 [&_input]:opacity-[0] [&_input]:cursor-pointer [&_>_span]:w-8.5 [&_>_span]:h-4.5 [&_>_span]:rounded-full [&_>_span]:transition-[background_.15s] [&_>_span::after]:block [&_>_span::after]:w-3 [&_>_span::after]:h-3 [&_>_span::after]:m-0.75 [&_>_span::after]:rounded-full [&_>_span::after]:content-[''] [&_>_span::after]:transition-[transform_.15s,background_.15s] [&_input:checked+span::after]:transform-[translateX(16px)] [&_input:focus-visible+span]:outline-2 outline-ring [&_input:focus-visible+span]:outline-offset-2 [&_input:disabled]:cursor-wait [&_>_span]:bg-muted-foreground [&_>_span::after]:bg-background [&_input:checked+span]:bg-muted-foreground [&_input:checked+span::after]:bg-background [&_input:focus-visible+span]:outline-ring"><input type="checkbox" role="switch" checked={item.enabled} disabled={busy} onChange={() => update({ ...item, enabled: !item.enabled })} aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.name}`} /><span aria-hidden="true" /></label>
        {!item.built_in && <><Button type="button" variant="ghost" aria-label={`Edit ${kind === "skills" ? "skill" : "persona"} ${item.name}`} className="min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground" disabled={busy} onClick={() => setEditing(item)}>Edit</Button><Button type="button" variant="ghost" aria-label={`Delete ${kind === "skills" ? "skill" : "persona"} ${item.name}`} className="danger min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground [&.danger]:text-destructive [&.danger:hover]:text-destructive" disabled={busy} onClick={() => setDeleteTarget(item)}>Delete</Button></>}
      </div>
    </article>) : null}
    <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {kind === "skills" ? "skill" : "persona"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes “{deleteTarget?.name ?? ""}” from your {kind === "skills" ? "skills" : "personas"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { if (deleteTarget) remove(deleteTarget); setDeleteTarget(null); }}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {editing && <form className="grid gap-3 p-4 border border-border [&_h3]:m-0 [&_h3]:text-[13px] [&_textarea]:w-full [&_textarea]:p-[9px_10px] [&_textarea]:border [&_textarea]:border-border [&_textarea]:rounded-md [&_textarea]:font-[inherit] [&_textarea]:text-[12px] [&_textarea]:resize-y rounded-xl bg-muted [&_textarea]:bg-background [&_textarea]:text-foreground" onSubmit={(event) => { event.preventDefault(); update({ ...editing, id: editing.id || `${kind === "skills" ? "skill" : "persona"}-${crypto.randomUUID()}` }); }}>
      <h3>{editing.id ? `Edit ${kind === "skills" ? "skill" : "persona"}` : `Add ${kind === "skills" ? "skill" : "persona"}`}</h3>
      <Field><FieldLabel htmlFor="library-name">Name</FieldLabel><Input id="library-name" required maxLength={80} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="library-description">Description</FieldLabel><Input id="library-description" maxLength={500} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></Field>
      <Field><FieldLabel htmlFor="library-content">{kind === "skills" ? "Instructions" : "Persona prompt"}</FieldLabel><textarea id="library-content" required maxLength={20000} rows={8} value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /></Field>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" className="settings-primary [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-primary [.provider-dialog_[data-slot=button]&]:text-primary-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-primary [.user-settings-page_[data-slot=button]&]:text-primary-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-primary [.user-settings-page_[data-slot=button]&:hover]:bg-primary" disabled={busy || !editing.name.trim() || !editing.content.trim()}>Save</Button></div>
    </form>}
    </div>
  </section>;
}
