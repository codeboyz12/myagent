"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { MessageComposer } from "./message-composer";
import { useChatWorkspace } from "@/components/workspace/chat-workspace";
import { Button } from "@/components/ui/button";
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
];

export function ChatWelcome() {
  const { createSession, setActiveSession } = useChatWorkspace();
  const [draft, setDraft] = useState("");
  const settings = useModelSettings();

  useEffect(() => {
    setActiveSession(null);
  }, [setActiveSession]);

  return (
    <section className="welcome-view" aria-label="Start a conversation">
      <div className="welcome-center">
        <div className="welcome-model">
          <span className="welcome-model-mark"><Icon name="leaf" /></span>
          <span>myagent</span>
        </div>
        <h1>Hello.</h1>
        <p className="welcome-question">How can I help you today?</p>
        <p className="suggestion-heading">Suggested prompts</p>
        <div className="suggestion-grid" aria-label="Suggested prompts">
          {suggestedPrompts.map((suggestion) => (
            <Button
              className="suggestion-card"
              key={suggestion.title}
              variant="outline"
              onClick={() => setDraft(suggestion.title)}
              type="button"
            >
              <span className="suggestion-title">{suggestion.title}</span>
              <span className="suggestion-detail">{suggestion.detail}</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="welcome-composer">
        <MessageComposer
          onSend={(text) => createSession(text)}
          disabled={!settings.loaded || !settings.configured}
          placeholder="What’s on your mind?"
          value={draft}
          onValueChange={setDraft}
          settingsControls={(
            <ModelSettingsControls
              models={settings.models}
              modelId={settings.modelId}
              onModelChange={settings.selectModel}
              controls={settings.modelControls}
              selections={settings.controlSelections}
              onControlChange={settings.selectModelControl}
              disabled={!settings.loaded || !settings.configured}
            />
          )}
        />
      </div>
    </section>
  );
}
