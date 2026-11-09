"use client";

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { ArrowUp } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

type MessageComposerProps = {
  onSend: (text: string) => Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  settingsControls?: ReactNode;
};

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Message myagent…",
  value,
  onValueChange,
  settingsControls,
}: MessageComposerProps) {
  const [internalText, setInternalText] = useState("");
  const [sending, setSending] = useState(false);
  const text = value ?? internalText;
  const setText = onValueChange ?? setInternalText;
  const canSend = text.trim().length > 0 && !disabled && !sending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      const sent = await onSend(text.trim());
      if (sent !== false) setText("");
    } catch {
      // Keep the draft in the composer after a failed request.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="composer-wrap">
      <form className="composer-form" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="message-input">Message myagent</label>
        <InputGroup className="composer">
          <InputGroupTextarea
            id="message-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            maxLength={100_000}
            disabled={disabled || sending}
          />
          <InputGroupAddon className="composer-footer" align="block-end">
            {settingsControls}
            <InputGroupButton
              className="send-button"
              disabled={!canSend}
              type="submit"
              aria-label="Send message"
              title="Send message"
              variant="default"
              size="icon-sm"
            >
              {sending ? <Spinner data-icon="inline-start" /> : <ArrowUp data-icon="inline-start" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
