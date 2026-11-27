"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const key = "myagent-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDark(document.documentElement.classList.contains("dark")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.dataset.openuiTheme = next ? "dark" : "light";
    localStorage.setItem(key, next ? "dark" : "light");
    setDark(next);
  }

  const nextTheme = dark ? "light" : "dark";
  return <Button type="button" variant="ghost" onClick={toggle} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`} aria-pressed={dark} className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
    {dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    <span className="sr-only">{dark ? "Dark theme" : "Light theme"}</span>
  </Button>;
}
