"use client";

import Link from "next/link";
import { useState } from "react";
import { ChartNoAxesCombined, ChevronRight, UserRound } from "lucide-react";

import { getSessionLabel, type SessionSummary } from "@/lib/chat-shape";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
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
  SidebarMenuAction,
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
  const [title, setTitle] = useState(session.title?.trim() || "New chat");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              className="[.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden"
              showOnHover
              aria-label="Conversation actions"
              title="Conversation actions"
            />
          }
        >
          <Icon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36 min-w-36">
          <DropdownMenuItem
            onClick={() => {
              setTitle(session.title?.trim() || "New chat");
              setRenameOpen(true);
            }}
          >
            <Icon name="edit" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Icon name="trash" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              Choose a name that helps you find this chat later.
            </DialogDescription>
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
                <FieldLabel htmlFor={`session-title-${session.session_id}`}>
                  Conversation name
                </FieldLabel>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the chat and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void onDelete(session.session_id)}
            >
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
  onOpenTips: () => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
};

type ConversationRowProps = {
  session: SessionSummary;
  active: boolean;
  onDeleteSession: WorkspaceSidebarProps["onDeleteSession"];
  onRenameSession: WorkspaceSidebarProps["onRenameSession"];
};

function ConversationRow({
  session,
  active,
  onDeleteSession,
  onRenameSession,
}: ConversationRowProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem className="session-row relative flex items-center min-h-9 border border-transparent rounded-md text-sidebar-foreground transition-[background_.15s,color_.15s] [&:hover]:bg-sidebar-accent [&:hover]:text-sidebar-accent-foreground [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:justify-center [.dark_.workspace-shell_&]:text-muted-foreground [.dark_.workspace-shell_&:hover]:bg-sidebar-accent [.dark_.workspace-shell_&:hover]:text-sidebar-accent-foreground">
      <SidebarMenuButton
        className="min-w-0 flex-1 flex gap-0 items-center p-[9px_10px] rounded-md text-inherit no-underline [&_span]:overflow-hidden [&_span]:whitespace-nowrap [&_span]:text-ellipsis [&_span]:text-[12px] [&_span]:leading-[1.4] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&_span]:hidden [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:justify-center [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:p-2 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&_>_svg]:block [.workspace-sidebar_&_>_svg]:hidden"
        isActive={active}
        render={
          <Link
            href={`/chat/${session.session_id}`}
            onClick={() => setOpenMobile(false)}
          />
        }
      >
        <Icon name="chat" />
        <span title={session.title ?? "New chat"}>
          {getSessionLabel(session)}
        </span>
      </SidebarMenuButton>
      <SessionActions
        session={session}
        onRename={onRenameSession}
        onDelete={onDeleteSession}
      />
    </SidebarMenuItem>
  );
}

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
      : new Date(
          updatedAt.getFullYear(),
          updatedAt.getMonth(),
          updatedAt.getDate(),
        ).getTime();
    const day = Math.floor((today.getTime() - updatedDay) / 86_400_000);
    const label =
      day <= 0
        ? labels[0]
        : day === 1
          ? labels[1]
          : day <= 7
            ? labels[2]
            : labels[3];
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
  onOpenTips,
  onDeleteSession,
  onRenameSession,
}: WorkspaceSidebarProps) {
  const { setOpenMobile, state } = useSidebar();
  const sessionGroups = groupSessionsByRecency(sessions);

  return (
    <Sidebar
      className="workspace-sidebar **:data-[sidebar=sidebar]:border-r border-r-sidebar-border **:data-[sidebar=sidebar]:bg-sidebar **:data-[sidebar=sidebar]:text-sidebar-foreground [.dark_&_[data-sidebar=sidebar]]:border-sidebar-border [.dark_&_[data-sidebar=sidebar]]:bg-sidebar [.dark_&_[data-sidebar=sidebar]]:text-sidebar-foreground"
      collapsible="icon"
    >
      <nav
        aria-label="Workspace navigation"
        className="flex size-full flex-col"
      >
        <SidebarHeader>
          <div className="sidebar-brand flex items-center gap-2.5 p-[4px_5px] mb-3.75 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:justify-center [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:gap-0 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:p-0">
            <span className="inline-grid place-items-center w-7.5 h-7.5 flex-[0_0_30px] border border-sidebar-border rounded-md bg-sidebar-accent text-sidebar-foreground [&_svg]:w-4 [&_svg]:h-4 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_.sidebar-brand_&]:hidden in-[.signin-brand]:w-8.5 in-[.signin-brand]:h-8.5 in-[.signin-brand]:rounded-lg [.signin-brand_&_svg]:w-4.75 [.signin-brand_&_svg]:h-4.75">
              <Icon name="leaf" />
            </span>
            <span className="block text-sidebar-foreground text-[15px] font-[650] tracking-[-.035em] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-sidebar-foreground in-[.signin-brand]:text-primary-foreground">
              myagent
            </span>
            <SidebarTrigger
              className="w-9 h-9 ml-auto border-0 rounded-md bg-transparent text-sidebar-foreground [&:hover]:bg-sidebar-accent [&:hover]:text-sidebar-accent-foreground [&_svg]:w-4.25 [&_svg]:h-4.25 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:m-0 [.dark_.workspace-shell_&:hover]:bg-sidebar-accent [.dark_.workspace-shell_&:hover]:text-sidebar-accent-foreground"
              aria-label={
                state === "expanded"
                  ? "Collapse navigation"
                  : "Expand navigation"
              }
              aria-expanded={state === "expanded"}
            />
          </div>
          <SidebarMenuButton
            render={<Link href="/chat" onClick={() => setOpenMobile(false)} />}
            tooltip="New chat"
          >
            <Icon name="plus" data-icon="inline-start" />
            <span>New chat</span>
          </SidebarMenuButton>
          <SidebarMenuButton
            render={
              <button
                type="button"
                onClick={() => {
                  setOpenMobile(false);
                  onOpenTips();
                }}
              />
            }
            tooltip="Tips and tour"
          >
            <Icon name="spark" data-icon="inline-start" />
            <span>Tips &amp; tour</span>
          </SidebarMenuButton>
          <SidebarMenuButton
            render={<Link href="/usage" onClick={() => setOpenMobile(false)} />}
            tooltip="Usage analytics"
          >
            <ChartNoAxesCombined data-icon="inline-start" />
            <span>Usage</span>
          </SidebarMenuButton>
        </SidebarHeader>

        <SidebarContent>
          {loading || sessions.length === 0 ? (
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground text-[11px] font-semibold tracking-[.015em] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-sidebar-foreground">
                Chats
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {loading ? (
                  <div
                    className="p-[5px_8px] text-muted-foreground text-[12px] leading-[1.55] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-muted-foreground"
                    role="status"
                  >
                    Loading conversations…
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-[5px_8px] text-muted-foreground text-[12px] leading-[1.55] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-muted-foreground">
                    Your conversations will appear here.
                  </div>
                ) : null}
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup className="gap-1.25">
              <SidebarGroupLabel className="m-[22px_8px_7px] text-sidebar-foreground text-[11px] font-semibold tracking-[.015em] [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-sidebar-foreground">
                Chats
              </SidebarGroupLabel>
              {sessionGroups.map((group) => (
                <SidebarGroup className="gap-0 p-0" key={group.label}>
                  <SidebarGroupLabel className="h-7 p-[0_10px] text-muted-foreground text-[10px] font-medium tracking-[.045em] uppercase [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden [.dark_.workspace-shell_&]:text-muted-foreground">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu
                      className="grid content-start gap-0.75 overflow-auto"
                      aria-label={`${group.label} chats`}
                    >
                      {group.sessions.map((session) => (
                        <ConversationRow
                          key={session.session_id}
                          session={session}
                          active={session.session_id === activeSessionId}
                          onDeleteSession={onDeleteSession}
                          onRenameSession={onRenameSession}
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="data-[sidebar=footer]:flex data-[sidebar=footer]:flex-row data-[sidebar=footer]:items-center data-[sidebar=footer]:gap-2.25 data-[sidebar=footer]:mt-auto data-[sidebar=footer]:p-2 data-[sidebar=footer]:border-t border-t-sidebar-border [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&[data-sidebar=footer]]:justify-center [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&[data-sidebar=footer]]:p-[8px_0] [.dark_.workspace-shell_&[data-sidebar=footer]]:border-sidebar-border">
          {/* <ThemeToggle /> */}
          <Link
            href="/settings"
            onClick={() => setOpenMobile(false)}
            className={buttonVariants({
              variant: "ghost",
              className:
                "[.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:size-11 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:min-w-11 [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:justify-center [.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:p-1.25 flex w-full min-w-0 h-auto justify-start gap-2.25 p-2.5 text-left [&:hover]:bg-accent",
            })}
          >
            <span
              className="grid place-items-center w-8.5 h-8.5 border border-border rounded-full bg-muted text-muted-foreground text-[12px] font-[650] [.dark_.workspace-shell_&]:border-sidebar-border [.dark_.workspace-shell_&]:bg-sidebar-accent [.dark_.workspace-shell_&]:text-sidebar-foreground [.user-settings-account-card_span:not(&)]:text-muted-foreground [.user-settings-account-card_span:not(&)]:text-[12px]"
              aria-hidden="true"
            >
              <UserRound className="size-4" />
            </span>
            <span className="[.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden min-w-0 flex-1 grid gap-0.75 [&_strong]:overflow-hidden [&_strong]:text-foreground [&_strong]:text-[11px] [&_strong]:font-[550] [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-muted-foreground [&_small]:text-[10px]">
              <strong>MyAgent account</strong>
              <small>Settings</small>
            </span>
            <ChevronRight
              className="[.workspace-shell_[data-slot=sidebar][data-collapsible=icon]_.workspace-sidebar_&]:hidden size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
