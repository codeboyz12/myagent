"use client";

import { useState } from "react";
import {
  Cable,
  LayoutDashboard,
  MessageSquareText,
  PanelLeft,
  Sparkles,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const tourSteps: {
  title: string;
  description: string;
  icon: LucideIcon;
  illustration: "message" | "model" | "conversations" | "generative-ui" | "skills" | "persona" | "mcp";
}[] = [
  {
    title: "Start with a message",
    description:
      "Ask a question in the message box, or choose a suggested prompt to get started. Press Enter to send and Shift+Enter to add a line.",
    icon: MessageSquareText,
    illustration: "message",
  },
  {
    title: "Choose your model",
    description:
      "Use the controls below the message box to choose a model and adjust its reasoning settings.",
    icon: SlidersHorizontal,
    illustration: "model",
  },
  {
    title: "Keep conversations organized",
    description:
      "Your conversations stay in the sidebar. Open a conversation’s menu to rename or delete it.",
    icon: PanelLeft,
    illustration: "conversations",
  },
  {
    title: "Create interactive interfaces",
    description:
      "Ask for an interactive dashboard, planner, or form. When generated, it appears right in your conversation.",
    icon: LayoutDashboard,
    illustration: "generative-ui",
  },
  {
    title: "Use Skills",
    description:
      "Skills give the agent reusable instructions for specific tasks. Manage them in Settings → Plugin → Skills.",
    icon: Sparkles,
    illustration: "skills",
  },
  {
    title: "Choose a Persona",
    description:
      "Personas shape the agent’s role and approach. Enable or manage them in Settings → Plugin → Persona.",
    icon: UserRound,
    illustration: "persona",
  },
  {
    title: "Connect MCP servers",
    description:
      "MCP servers let the agent use external tools. Manage connections in Settings → Plugin → MCP servers.",
    icon: Cable,
    illustration: "mcp",
  },
];

function TourIllustration({
  kind,
  title,
}: {
  kind: (typeof tourSteps)[number]["illustration"];
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted p-2.5">
      <svg
        aria-label={`${title} illustration`}
        className="h-32 w-full text-muted-foreground"
        role="img"
        viewBox="0 0 480 160"
        fill="none"
      >
        <rect x="8" y="8" width="464" height="144" rx="10" fill="var(--background)" stroke="var(--border)" />
        <path d="M8 34h464" stroke="var(--border)" />
        <circle cx="24" cy="21" r="3" fill="currentColor" opacity=".35" />
        <circle cx="35" cy="21" r="3" fill="currentColor" opacity=".35" />
        <circle cx="46" cy="21" r="3" fill="currentColor" opacity=".35" />
        {kind === "message" && (
          <>
            <rect x="36" y="52" width="184" height="27" rx="8" fill="var(--muted)" />
            <path d="M51 64h126" stroke="currentColor" strokeLinecap="round" opacity=".55" />
            <rect x="254" y="88" width="188" height="24" rx="8" fill="var(--primary)" opacity=".12" />
            <path d="M269 100h134" stroke="currentColor" strokeLinecap="round" opacity=".55" />
            <rect x="36" y="122" width="406" height="17" rx="6" fill="var(--background)" stroke="var(--border)" />
            <path d="M52 130h178" stroke="currentColor" strokeLinecap="round" opacity=".4" />
          </>
        )}
        {kind === "model" && (
          <>
            <path d="M42 59h396M42 99h396" stroke="var(--border)" />
            <rect x="42" y="44" width="126" height="25" rx="7" fill="var(--muted)" />
            <path d="M57 56h78" stroke="currentColor" strokeLinecap="round" opacity=".6" />
            <rect x="185" y="44" width="95" height="25" rx="7" fill="var(--muted)" />
            <path d="M200 56h48" stroke="currentColor" strokeLinecap="round" opacity=".6" />
            <path d="M48 119h298" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
            <path d="M48 119h178" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".55" />
            <circle cx="226" cy="119" r="7" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
          </>
        )}
        {kind === "conversations" && (
          <>
            <path d="M128 34v118" stroke="var(--border)" />
            <rect x="24" y="48" width="91" height="14" rx="5" fill="var(--muted)" />
            <rect x="24" y="73" width="91" height="14" rx="5" fill="var(--primary)" opacity=".12" />
            <rect x="24" y="98" width="91" height="14" rx="5" fill="var(--muted)" />
            <rect x="153" y="50" width="152" height="12" rx="5" fill="var(--muted)" />
            <rect x="153" y="75" width="275" height="9" rx="4" fill="var(--muted)" />
            <rect x="194" y="96" width="234" height="20" rx="7" fill="var(--primary)" opacity=".12" />
            <rect x="153" y="127" width="275" height="9" rx="4" fill="var(--muted)" />
          </>
        )}
        {kind === "generative-ui" && (
          <>
            <rect x="28" y="47" width="126" height="37" rx="7" fill="var(--muted)" />
            <rect x="166" y="47" width="126" height="37" rx="7" fill="var(--muted)" />
            <rect x="304" y="47" width="148" height="37" rx="7" fill="var(--muted)" />
            <path d="M41 72h47M179 72h61M318 72h83" stroke="currentColor" strokeLinecap="round" opacity=".5" />
            <path d="M44 127 92 107l38 12 46-29 45 15 39-21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M44 137h218" stroke="var(--border)" />
            <rect x="300" y="97" width="152" height="42" rx="7" fill="var(--muted)" />
            <path d="M315 124v-11m25 11v-20m25 20v-15m25 15v-26m25 26v-13" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity=".45" />
          </>
        )}
        {kind === "skills" && (
          <>
            <rect x="28" y="47" width="424" height="27" rx="7" fill="var(--background)" stroke="var(--border)" />
            <rect x="39" y="54" width="14" height="14" rx="4" fill="var(--primary)" opacity=".14" />
            <path d="M64 60h100m-100 6h205" stroke="currentColor" strokeLinecap="round" opacity=".5" />
            <rect x="414" y="55" width="25" height="12" rx="6" fill="var(--primary)" opacity=".22" />
            <rect x="28" y="83" width="424" height="27" rx="7" fill="var(--background)" stroke="var(--border)" />
            <rect x="39" y="90" width="14" height="14" rx="4" fill="var(--primary)" opacity=".14" />
            <path d="M64 96h130m-130 6h174" stroke="currentColor" strokeLinecap="round" opacity=".5" />
            <rect x="414" y="91" width="25" height="12" rx="6" fill="var(--primary)" opacity=".22" />
            <rect x="28" y="119" width="424" height="20" rx="7" fill="var(--muted)" />
            <path d="M40 129h112" stroke="currentColor" strokeLinecap="round" opacity=".4" />
          </>
        )}
        {kind === "persona" && (
          <>
            <circle cx="94" cy="91" r="31" fill="var(--muted)" />
            <circle cx="94" cy="82" r="10" fill="currentColor" opacity=".42" />
            <path d="M75 108c4-12 34-12 38 0" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".42" />
            <rect x="150" y="52" width="244" height="13" rx="5" fill="var(--muted)" />
            <rect x="150" y="76" width="276" height="8" rx="4" fill="var(--muted)" />
            <rect x="150" y="91" width="246" height="8" rx="4" fill="var(--muted)" />
            <rect x="150" y="112" width="92" height="20" rx="10" fill="var(--primary)" opacity=".12" />
            <rect x="250" y="112" width="104" height="20" rx="10" fill="var(--primary)" opacity=".12" />
          </>
        )}
        {kind === "mcp" && (
          <>
            <rect x="31" y="51" width="125" height="77" rx="9" fill="var(--muted)" />
            <rect x="324" y="51" width="125" height="77" rx="9" fill="var(--muted)" />
            <rect x="48" y="66" width="91" height="9" rx="4" fill="currentColor" opacity=".35" />
            <rect x="48" y="84" width="62" height="7" rx="3" fill="currentColor" opacity=".25" />
            <circle cx="55" cy="108" r="4" fill="currentColor" opacity=".55" />
            <rect x="341" y="66" width="91" height="9" rx="4" fill="currentColor" opacity=".35" />
            <rect x="341" y="84" width="62" height="7" rx="3" fill="currentColor" opacity=".25" />
            <circle cx="348" cy="108" r="4" fill="currentColor" opacity=".55" />
            <path d="M157 90h164m-16-10 12 10-12 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="239" cy="90" r="16" fill="var(--background)" stroke="var(--border)" />
            <path d="m234 90 4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </div>
  );
}

export function TipsTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = tourSteps[stepIndex];
  const StepIcon = step.icon;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setStepIndex(0);
    onOpenChange(nextOpen);
  }

  function goNext() {
    if (stepIndex === tourSteps.length - 1) {
      handleOpenChange(false);
      return;
    }
    setStepIndex((index) => index + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-4 text-left">
          <div className="grid size-11 place-items-center rounded-xl border border-border bg-muted text-foreground">
            <StepIcon aria-hidden="true" className="size-5" />
          </div>
          <div className="grid gap-1.5">
            <DialogTitle>{step.title}</DialogTitle>
            <DialogDescription aria-live="polite">{step.description}</DialogDescription>
          </div>
        </DialogHeader>

        <TourIllustration kind={step.illustration} title={step.title} />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Tip {stepIndex + 1} of {tourSteps.length}</span>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {tourSteps.map((tourStep, index) => (
              <span
                className={index === stepIndex ? "h-1.5 w-5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground/30"}
                key={tourStep.title}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="-mx-4 -mb-4 flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Skip tour
          </Button>
          <div className="flex justify-end gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={() => setStepIndex((index) => index - 1)}>
                Back
              </Button>
            )}
            <Button onClick={goNext}>
              {stepIndex === tourSteps.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
