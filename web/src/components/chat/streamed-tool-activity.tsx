"use client";

import { CheckIcon, CircleAlertIcon, GlobeIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import type { ToolActivity } from "@/lib/chat-shape";
import { toolActivityLabel } from "@/lib/tool-activity-label";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";

export function StreamedToolActivity({ activities, busy }: { activities: ToolActivity[]; busy: boolean }) {
  const [expanded, setExpanded] = useState(true);

  const running = [...activities].reverse().find((activity) => activity.status === "running");
  const currentLabel = running
    ? toolActivityLabel(running, "running")
    : busy
      ? "Thinking"
      : activities.length === 1
        ? "Worked through 1 step"
        : `Worked through ${activities.length} steps`;
  const isExpanded = busy || expanded;
  const citations = [...new Map(
    activities.flatMap((activity) => activity.sources ?? []).map((source) => [source.url, source]),
  ).values()];
  const images = [...new Map(
    activities.flatMap((activity) => activity.images ?? []).map((item) => [item.url, item]),
  ).values()];

  return (
    <div className="w-[min(100%,510px)] m-[4px_0_12px]">
      <Trace aria-label="Agent progress" className="gap-0.5 py-0.5" aria-live="polite">
        <TraceCollapsible open={isExpanded} onOpenChange={setExpanded}>
          <TraceCollapsibleTrigger>
            <TraceLine status={busy ? "running" : undefined} className="text-xs leading-5">
              <TraceIcon className={busy ? "animate-[intelligence-pulse_1.25s_ease-in-out_infinite]" : "-translate-y-px"}>
                <SparklesIcon />
              </TraceIcon>
              <TraceTitle>{currentLabel}{busy && <span className="inline-block overflow-hidden w-0 align-bottom animate-[intelligence-ellipsis_1.2s_steps(4,end)_infinite]" aria-hidden="true">…</span>}</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="mt-1 mb-1 grid gap-2 text-[11px] leading-[1.45]">
            {activities.map((activity) => (
              <Trace key={activity.tool_call_id} className="gap-1">
                <TraceCollapsible>
                  <TraceCollapsibleTrigger>
                    <TraceLine
                      status={activity.status === "error" ? "error" : activity.status === "running" ? "running" : undefined}
                      className="gap-2 text-[11px] leading-[1.45]"
                    >
                      <TraceIcon className="size-3.5">
                        {activity.status === "running" ? <LoaderCircleIcon className="animate-spin" /> : activity.status === "error" ? <CircleAlertIcon /> : <CheckIcon />}
                      </TraceIcon>
                      <TraceTitle>{toolActivityLabel(activity, activity.status === "running" ? "running" : "completed")}</TraceTitle>
                    </TraceLine>
                  </TraceCollapsibleTrigger>
                  <TraceCollapsibleContent className="mt-1 text-[10px]">
                    <p className="m-0 mb-1 font-medium">{activity.status === "error" ? "Failed" : activity.status === "running" ? "Running" : "Completed"}</p>
                    {Object.keys(activity.arguments).length > 0 && (
                      <pre className="m-0 max-w-full overflow-x-auto rounded-md bg-muted p-2 text-[10px] leading-[1.5] text-foreground">{JSON.stringify(activity.arguments, null, 2)}</pre>
                    )}
                  </TraceCollapsibleContent>
                </TraceCollapsible>
              </Trace>
            ))}
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
      {citations.length > 0 && (
        <Trace aria-label="Search source citations" className="ml-6 mt-1 gap-0.5">
          <TraceCollapsible>
            <TraceCollapsibleTrigger>
              <TraceLine className="text-[10px]">
                <TraceTitle>Sources</TraceTitle>
                <TraceDescription>{citations.length}</TraceDescription>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="grid gap-1 text-[10px]">
              {citations.map((source) => {
            let host = source.url;
            try { host = new URL(source.url).hostname; } catch { /* Schema already validates citation URLs. */ }
                return (
                  <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer" title={source.title || source.url}>
                    <TraceLine className="text-[10px]">
                      <TraceIcon><GlobeIcon /></TraceIcon>
                      <TraceTitle>{source.title || host}</TraceTitle>
                    </TraceLine>
                  </a>
                );
              })}
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      )}
      {images.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.25 m-[2px_0_12px_24px]" aria-label="Images from web search">
          {images.map((item) => (
            <a
              className="grid min-w-0 gap-1.25 overflow-hidden border border-border rounded-xl text-muted-foreground bg-background text-[10px] no-underline [&:hover]:border-border [&:hover]:text-foreground [&:hover]:bg-accent [&_img]:block [&_img]:w-full [&_img]:h-28.75 [&_img]:object-cover [&_img]:bg-accent [&_span]:line-clamp-2 [&_span]:min-h-6.75 [&_span]:p-[0_8px_8px]"
              href={item.source_url}
              key={item.url}
              target="_blank"
              rel="noopener noreferrer"
              title={item.title || item.source_url}
            >
              {/* External MCP image hosts are dynamic, so render without Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.title ? "" : "Photo from web search"} loading="lazy" referrerPolicy="no-referrer" />
              <span>{item.title || new URL(item.source_url).hostname}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
