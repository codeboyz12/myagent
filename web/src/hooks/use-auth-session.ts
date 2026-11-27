"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Redirect authenticated visitors and report when the initial session check ends. */
export function useAuthSession() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (response.ok) router.replace("/chat");
      })
      .finally(() => {
        if (mounted) setCheckingSession(false);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  return checkingSession;
}
