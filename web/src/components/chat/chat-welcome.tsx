"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { MessageComposer } from "./message-composer";
import { useChatWorkspace } from "@/components/workspace/chat-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelSettingsControls } from "./model-settings-controls";
import { useModelSettings } from "@/hooks/use-model-settings";

const suggestedPrompts = [
  {
    title: "Think through an idea",
    detail: "Explore options and find a clear next step.",
  },
  {
    title: "Summarize a complex topic",
    detail: "Get the key points in plain language.",
  },
  {
    title: "Plan a project",
    detail: "Turn an idea into an actionable plan.",
  },
  {
    title: "Explain something simply",
    detail: "Break down a topic in clear terms.",
  },
  {
    title: "Build a trip planner",
    detail: "Turn a Kyoto visit into an interactive day-by-day plan.",
    prompt: "Create an interactive three-day Kyoto trip planner with a day-by-day schedule and useful choices for temples, food, and travel pace.",
  },
  {
    title: "Visualize a dataset",
    detail: "Combine metric cards, tables, and charts.",
    prompt: "Create a dashboard with metric cards, a comparison table, and charts. Use data from our conversation; if I have not provided data, ask for it or label sample values as illustrative.",
  },
  {
    title: "Create a photo gallery",
    detail: "Find real images and arrange them in an interactive gallery.",
    prompt: "Find real photos of Kyoto temples and create an OpenUI image gallery with accurate captions and source links.",
  },
];

export function ChatWelcome() {
  const { createSession, setActiveSession } = useChatWorkspace();
  const [draft, setDraft] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const settings = useModelSettings();

  useEffect(() => {
    setActiveSession(null);
  }, [setActiveSession]);

  return (
    <section className="min-h-0 flex-1 flex flex-col max-[760px]:p-[0_16px]" aria-label="Start a conversation">
      <div className="welcome-center box-border w-[min(64rem,100%)] flex-1 flex flex-col items-center justify-center m-[0_auto] p-[40px_32px] text-center [&_h1]:m-[0_0_2px] [&_h1]:leading-[1.2] max-[760px]:p-[32px_18px_20px] max-[760px]:[&_h1]:text-[29px] max-[560px]:p-[24px_2px_16px] [&_h1]:text-[clamp(34px,4vw,46px)] [&_h1]:font-[570] [&_h1]:tracking-[-.055em]">
        <div className="flex items-center justify-center gap-2.5 mb-5.5 text-[14px] font-[550] text-foreground">
          <span className="grid place-items-center w-7.5 h-7.5 border rounded-full [&_svg]:w-4 [&_svg]:h-4 bg-accent text-muted-foreground"><Icon name="leaf" /></span>
          <span>myagent</span>
        </div>
        <h1>Hello.</h1>
        <p className="m-0 text-[15px] leading-normal text-muted-foreground">How can I help you today?</p>
        <MessageComposer
          onSend={(text) => createSession(text)}
          disabled={!settings.loaded || !settings.configured}
          placeholder="What’s on your mind?"
          value={draft}
          onValueChange={setDraft}
          settingsControls={(
            <ModelSettingsControls
              models={settings.models}
              modelId={settings.selectedModelValue}
              onModelChange={settings.selectModel}
              controls={settings.modelControls}
              selections={settings.controlSelections}
              onControlChange={settings.selectModelControl}
              disabled={!settings.loaded || !settings.configured}
            />
          )}
        />
        {settings.error && (
          <p className="text-destructive text-[10px]" role="alert">{settings.error}</p>
        )}
        <Button
          className="mt-3.5 h-9 text-muted-foreground text-[12px] border-border rounded-md bg-background"
          variant="outline"
          type="button"
          onClick={() => setSuggestionsOpen(true)}
        >
          Choose a suggested prompt
        </Button>
      </div>
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="sm:max-w-xl overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Choose a starting prompt</DialogTitle>
            <DialogDescription>Select one to add it to the message box. You can edit it before sending.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2.5 mt-1 max-[760px]:grid-cols-[1fr]">
            {suggestedPrompts.map((suggestion) => (
              <Button
                className="w-full h-auto min-w-0 min-h-19 flex flex-col items-start justify-center gap-1.25 p-[12px_14px] rounded-lg text-left whitespace-normal border-border bg-background [&:hover]:border-border [&:hover]:bg-accent"
                key={suggestion.title}
                variant="outline"
                onClick={() => {
                  setDraft(suggestion.prompt ?? suggestion.title);
                  setSuggestionsOpen(false);
                }}
                type="button"
              >
                <span className="text-foreground text-[13px] font-medium leading-[1.35]">{suggestion.title}</span>
                <span className="text-muted-foreground text-[11px] font-normal leading-[1.4]">{suggestion.detail}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
