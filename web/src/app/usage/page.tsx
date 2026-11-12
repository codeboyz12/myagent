import { ChatWorkspace } from "@/components/workspace/chat-workspace";
import { UsageAnalytics } from "@/components/usage/usage-analytics";

export default function UsagePage() {
  return (
    <ChatWorkspace>
      <UsageAnalytics />
    </ChatWorkspace>
  );
}
