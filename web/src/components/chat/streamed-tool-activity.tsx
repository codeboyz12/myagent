"use client";

import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { streamToolActivityUI } from "@/app/chat/actions";
import type { ToolActivity } from "@/lib/chat-shape";
import { toolActivityLabel } from "@/lib/tool-activity-label";

export function StreamedToolActivity({ activities, busy }: { activities: ToolActivity[]; busy: boolean }) {
  const [ui, setUi] = useState<ReactNode>(null);
  const [expanded, setExpanded] = useState(true);
  const streamKey = activities.map((activity) => `${activity.tool_call_id}:${activity.status}`).join("|");

  useEffect(() => {
    if (busy || activities.length === 0) return;
    let active = true;
    void streamToolActivityUI(activities).then((result) => {
      if (active) setUi(result);
    }).catch(() => {
      if (active) setUi(<p className="m-[8px_0] text-[11px] text-muted-foreground">Could not render agent activity.</p>);
    });
    return () => { active = false; };
    // Run once after a turn has finished, not for every streamed activity update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, streamKey]);

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
      <section className="grid gap-0.5 py-0.5 text-muted-foreground" aria-label="Agent progress" aria-live="polite">
        <button className="inline-flex items-center gap-2 min-h-7.5 p-[2px_0] border-0 bg-transparent text-inherit cursor-pointer font-[inherit] text-[12px] text-left [&:hover]:text-muted-foreground" type="button" aria-expanded={isExpanded} onClick={() => setExpanded((value) => !value)}>
          <span className={`grid size-4 place-items-center text-muted-foreground [&_svg]:size-3.5${busy ? " animate-[intelligence-pulse_1.25s_ease-in-out_infinite]" : ""}`} aria-hidden="true"><SparklesIcon /></span>
          <span className={busy ? "text-muted-foreground" : "text-muted-foreground"}>{currentLabel}{busy && <span className="inline-block overflow-hidden w-0 align-bottom animate-[intelligence-ellipsis_1.2s_steps(4,end)_infinite]" aria-hidden="true">…</span>}</span>
          <ChevronDownIcon className={`size-3.25 transition-transform duration-150 ease-in-out${isExpanded ? " rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {isExpanded && activities.length > 0 && (
          <ol className="grid gap-2 m-[3px_0_4px_7px] p-[0_0_0_17px] border-l border-border list-none">
            {activities.map((activity) => (
              <li className={`flex items-center gap-2 text-[11px] leading-[1.45] ${activity.status === "running" ? "text-muted-foreground" : activity.status === "error" ? "text-muted-foreground" : "text-muted-foreground"}`} key={activity.tool_call_id}>
                <span className={`grid w-3.25 flex-[0_0_13px] place-items-center text-[10px] ${activity.status === "completed" ? "text-muted-foreground" : activity.status === "error" ? "text-muted-foreground" : "text-muted-foreground"} [&_i]:size-1.5 [&_i]:rounded-full [&_i]:bg-muted-foreground ring-2 ring-ring/20 [&_i]:animate-[intelligence-pulse_1s_ease-in-out_infinite]`} aria-hidden="true">{activity.status === "running" ? <i /> : activity.status === "error" ? "!" : "✓"}</span>
                <span>{toolActivityLabel(activity, activity.status === "running" ? "running" : "completed")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {citations.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1.5 m-[2px_0_8px_24px]" aria-label="Search source citations">
          <span className="text-muted-foreground text-[10px]">Sources</span>
          {citations.map((source, index) => {
            let host = source.url;
            try { host = new URL(source.url).hostname; } catch { /* Schema already validates citation URLs. */ }
            return <a
              className="inline-flex max-w-52.5 items-center gap-1.25 overflow-hidden border border-border rounded-full p-[3px_8px_3px_4px] text-muted-foreground bg-accent text-[10px] leading-[1.3] no-underline text-ellipsis whitespace-nowrap [&:hover]:border-border [&:hover]:text-foreground [&:hover]:bg-muted [&_>_span]:grid [&_>_span]:flex-[0_0_16px] [&_>_span]:w-4 [&_>_span]:h-4 [&_>_span]:place-items-center [&_>_span]:rounded-full [&_>_span]:text-primary-foreground [&_>_span]:bg-muted [&_>_span]:text-[9px]"
              href={source.url}
              key={source.url}
              target="_blank"
              rel="noopener noreferrer"
              title={source.title || source.url}
              aria-label={"Source " + (index + 1) + ": " + (source.title || host)}
            >
              <span>{index + 1}</span>{host}
            </a>;
          })}
        </nav>
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
              <img src={item.url} alt={item.title || "Photo from web search"} loading="lazy" referrerPolicy="no-referrer" />
              <span>{item.title || new URL(item.source_url).hostname}</span>
            </a>
          ))}
        </div>
      )}
      {ui && <details className="m-[8px_0_0_24px] text-muted-foreground text-[11px] [&_summary]:w-fit [&_summary]:cursor-pointer [&_summary:hover]:text-muted-foreground"><summary>Generated result details</summary>{ui}</details>}
    </div>
  );
}
