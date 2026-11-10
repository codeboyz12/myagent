"use server";

import { createStreamableUI } from "@ai-sdk/rsc";
import { z } from "zod";

import { toolActivitySchema } from "@/lib/chat-shape";
import { toolActivityLabel } from "@/lib/tool-activity-label";

function ActivityCard({ activity }: { activity: z.infer<typeof toolActivitySchema> }) {
  const visibleArguments = Object.entries(activity.arguments).filter(([key]) =>
    !/(token|secret|password|authorization|api.?key)/i.test(key),
  );

  return (
    <article className={`rsc-activity-card  flex gap-2.25 p-[10px_12px] border border-border rounded-lg bg-primary text-muted-foreground${activity.status === "error" ? "is-error" : ""}`}>
      <span className="grid flex-[0_0_18px] w-4.5 h-4.5 place-items-center rounded-full bg-primary text-muted-foreground text-[11px] [.rsc-activity-card.is-error_&]:bg-destructive/10 [.rsc-activity-card.is-error_&]:text-muted-foreground" aria-hidden="true">{activity.status === "error" ? "!" : "✓"}</span>
      <div className="min-w-0 flex-1 [&_strong]:text-[11px] [&_strong]:font-[550] [&_dl]:grid [&_dl]:gap-1 [&_dl]:m-[7px_0_0] [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[90px_minmax(0,1fr)] [&_dl_>_div]:gap-1.75 [&_dl_>_div]:text-[10px] [&_dt]:text-muted-foreground [&_dd]:wrap-anywhere [&_dd]:m-0 [&_dd]:text-muted-foreground">
        <strong>{toolActivityLabel(activity, "completed")}</strong>
        {visibleArguments.length > 0 && (
          <dl>
            {visibleArguments.map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>{typeof value === "string" ? value.slice(0, 180) : JSON.stringify(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

function ActivityCards({ activities }: { activities: z.infer<typeof toolActivitySchema>[] }) {
  return (
    <section className="grid gap-1.75 w-[min(100%,480px)] m-[8px_0]" aria-label="Generated tool results">
      {activities.map((activity) => <ActivityCard activity={activity} key={activity.tool_call_id} />)}
    </section>
  );
}

export async function streamToolActivityUI(input: unknown) {
  const parsed = z.array(toolActivitySchema).max(30).safeParse(input);
  if (!parsed.success) return <p className="m-[8px_0] text-[11px] text-muted-foreground">Could not render agent activity.</p>;
  if (parsed.data.length === 0) return null;

  const stream = createStreamableUI(<p className="m-[8px_0] text-muted-foreground text-[11px]">Preparing agent results…</p>);
  void (async () => {
    const visible: z.infer<typeof toolActivitySchema>[] = [];
    for (const activity of parsed.data) {
      visible.push(activity);
      stream.update(<ActivityCards activities={[...visible]} />);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    stream.done(<ActivityCards activities={visible} />);
  })().catch(() => stream.error(new Error("Could not render agent activity.")));

  return stream.value;
}
