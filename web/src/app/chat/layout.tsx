"use client";

import type { ReactNode } from "react";

import { ChatWorkspace } from "@/components/workspace/chat-workspace";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatWorkspace>{children}</ChatWorkspace>;
}
