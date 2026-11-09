"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { getSessionLabel, type SessionSummary } from "@/lib/chat-shape";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type SessionGroup = {
  label: "Today" | "Yesterday" | "Previous 7 days" | "Older";
  sessions: SessionSummary[];
};

function SessionActions({
  session,
  onRename,
  onDelete,
}: {
  session: SessionSummary;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(getSessionLabel(session));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className="session-action-trigger" variant="ghost" size="icon-sm" aria-label="Conversation actions" title="Conversation actions" />}
        >
          <Icon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="session-action-menu">
          <DropdownMenuItem onClick={() => {
            setTitle(getSessionLabel(session));
            setRenameOpen(true);
          }}>
            <Icon name="edit" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Choose a name that helps you find this chat later.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextTitle = title.trim();
              if (!nextTitle) return;
              setRenameOpen(false);
              void onRename(session.session_id, nextTitle);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`session-title-${session.session_id}`}>Conversation name</FieldLabel>
                <Input
                  id={`session-title-${session.session_id}`}
                  value={title}
                  maxLength={200}
                  autoFocus
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!title.trim()}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the chat and its history.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete(session.session_id)}>
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type WorkspaceSidebarProps = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  loading: boolean;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
};

function groupSessionsByRecency(sessions: SessionSummary[]): SessionGroup[] {
  if (sessions.length === 0) return [];

  const labels = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = new Map<(typeof labels)[number], SessionSummary[]>(
    labels.map((label) => [label, []]),
  );

  for (const session of sessions) {
    const updatedAt = new Date(session.updated_at);
    const updatedDay = Number.isNaN(updatedAt.getTime())
      ? Number.POSITIVE_INFINITY
      : new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate()).getTime();
    const day = Math.floor((today.getTime() - updatedDay) / 86_400_000);
    const label = day <= 0 ? labels[0] : day === 1 ? labels[1] : day <= 7 ? labels[2] : labels[3];
    groups.get(label)?.push(session);
  }

  return labels.flatMap((label) => {
    const items = groups.get(label) ?? [];
    return items.length ? [{ label, sessions: items }] : [];
  });
}

export function WorkspaceSidebar({
  sessions,
  activeSessionId,
  loading,
  onDeleteSession,
  onRenameSession,
}: WorkspaceSidebarProps) {
  const { setOpenMobile, setOpen, state } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const visibleSessions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      getSessionLabel(session).toLocaleLowerCase().includes(query),
    );
  }, [searchQuery, sessions]);
  const sessionGroups = groupSessionsByRecency(visibleSessions);

  const openSearch = useCallback(() => {
    if (state === "collapsed") setOpen(true);
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInput.current?.focus());
  }, [setOpen, state]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [openSearch]);

  return (
    <Sidebar className="workspace-sidebar" collapsible="icon">
      <SidebarHeader>
        <div className="sidebar-brand">
          <span className="brand-mark"><Icon name="leaf" /></span>
          <span className="brand-name">myagent</span>
          <SidebarTrigger className="sidebar-collapse-button" aria-label="Collapse sidebar" />
        </div>

        <Button
          className="new-chat-button"
          variant="ghost"
          nativeButton={false}
          render={<Link href="/chat" onClick={() => setOpenMobile(false)} />}
        >
          <Icon name="plus" data-icon="inline-start" />
          <span>New chat</span>
        </Button>

        {searchOpen ? (
          <div className="sidebar-search">
            <Icon name="search" />
            <Input
              ref={searchInput}
              aria-label="Search conversations"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
            />
            <Button
              className="sidebar-search-close"
              variant="ghost"
              size="icon-sm"
              aria-label="Close search"
              onClick={closeSearch}
            >
              <Icon name="close" />
            </Button>
          </div>
        ) : (
          <Button className="search-chat-button" variant="ghost" onClick={openSearch}>
            <Icon name="search" data-icon="inline-start" />
            <span>Search</span>
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent>
        {loading || visibleSessions.length === 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel className="sidebar-section-label">
              {searchQuery.trim() ? "Search results" : "Chats"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {loading ? (
                <div className="sidebar-empty" role="status">Loading conversations…</div>
              ) : searchQuery.trim() ? (
                <div className="sidebar-empty">No matching conversations.</div>
              ) : sessions.length === 0 ? (
                <div className="sidebar-empty">Your conversations will appear here.</div>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup className="chat-history-group">
            <SidebarGroupLabel className="sidebar-section-label">Chats</SidebarGroupLabel>
            {sessionGroups.map((group) => (
              <SidebarGroup className="sidebar-history-period" key={group.label}>
                <SidebarGroupLabel className="sidebar-period-label">{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="session-list" aria-label={`${group.label} chats`}>
                    {group.sessions.map((session) => {
                      const active = session.session_id === activeSessionId;
                      return (
                        <SidebarMenuItem className="session-row" key={session.session_id}>
                          <SidebarMenuButton
                            className="session-link"
                            isActive={active}
                            render={<Link href={`/chat/${session.session_id}`} onClick={() => setOpenMobile(false)} />}
                          >
                            <Icon name="chat" />
                            <span>{getSessionLabel(session)}</span>
                          </SidebarMenuButton>
                          <div className="session-actions">
                            <SessionActions
                              session={session}
                              onRename={onRenameSession}
                              onDelete={onDeleteSession}
                            />
                          </div>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="sidebar-footer">
        <Button
          className="user-settings-trigger"
          variant="ghost"
          nativeButton={false}
          aria-label="User settings"
          title="User settings"
          render={<Link href="/settings" onClick={() => setOpenMobile(false)} />}
        >
          <span className="account-avatar" aria-hidden="true">M</span>
          <span className="user-settings-trigger-label"><strong>MyAgent account</strong><small>Settings</small></span>
          <span className="user-settings-trigger-icon" aria-hidden="true">›</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
