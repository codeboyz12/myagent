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
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  settingsControls?: ReactNode;
};

export function MessageComposer({
  onSend,
  onStop,
  busy = false,
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
    <div className="flex-[0_0_auto] pt-3 in-[.welcome-center]:w-[min(52rem,100%)] in-[.welcome-center]:mt-7 in-[.welcome-center]:pt-0">
      <form className="composer-form" onSubmit={(event) => void submit(event)}>
        <label className="sr-only absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0" htmlFor="message-input">Message myagent</label>
        <InputGroup className="h-auto p-[12px_14px_9px] bg-transparent opacity-[1] transition-[border-color_.15s,box-shadow_.15s] has-disabled:bg-transparent! has-disabled:opacity-100! [&_textarea]:block [&_textarea]:w-full [&_textarea]:min-w-0 [&_textarea]:min-h-10.5 [&_textarea]:max-h-45 [&_textarea]:resize-y [&_textarea]:wrap-anywhere [&_textarea]:text-foreground [&_textarea]:text-[14px] [&_textarea]:leading-[1.55] [&_textarea::placeholder]:text-muted-foreground [&_textarea:focus-visible]:outline-0 [&_textarea:focus-visible]:border-transparent! [&_textarea:focus-visible]:ring-0! max-[760px]:p-[10px_11px_8px] max-[760px]:rounded-xl max-[760px]:[&_textarea]:min-h-9.5 max-[760px]:[&_textarea]:text-[13px] border-transparent rounded-2xl shadow-none ring-0 focus-within:border-transparent focus-within:shadow-none focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-transparent! has-[[data-slot=input-group-control]:focus-visible]:ring-0!">
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
          <InputGroupAddon className="composer-footer flex items-center justify-between gap-3 mt-2 p-[8px_0_0] border-t border-border max-[560px]:items-end max-[560px]:gap-2" align="block-end">
            {settingsControls}
            {busy && onStop ? <InputGroupButton type="button" variant="outline" size="sm" onClick={onStop} aria-label="Stop generating" title="Stop generating">Stop</InputGroupButton> : null}
            <InputGroupButton
              className="send-button rounded-lg shadow-[none] [&:hover]:bg-primary border-0 bg-primary text-primary-foreground [&:hover:not(:disabled)]:bg-primary disabled:opacity-[1] disabled:bg-transparent disabled:text-muted-foreground disabled:shadow-[none] **:data-[slot=spinner]:w-4 **:data-[slot=spinner]:h-4"
              disabled={!canSend}
              type="submit"
              aria-label="Send message"
              title="Send message"
              variant="default"
              size="icon-sm"
            >
              {sending && !busy ? (
                <Spinner aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" className="in-[.send-button]:w-4.75 in-[.send-button]:h-4.75" size={19} strokeWidth={2.25} />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
