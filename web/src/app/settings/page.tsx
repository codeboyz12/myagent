"use client";

import { useRouter } from "next/navigation";

import { UserSettingsPage } from "@/components/workspace/user-settings-page";
import { useModelSettings } from "@/hooks/use-model-settings";

export default function SettingsRoute() {
  const router = useRouter();
  const modelSettings = useModelSettings();

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
  }

  return (
    <UserSettingsPage
      providers={modelSettings.providers}
      activeProviderId={modelSettings.activeProviderId}
      models={modelSettings.models}
      onSaved={modelSettings.refresh}
      onSignOut={() => void signOut()}
    />
  );
}
