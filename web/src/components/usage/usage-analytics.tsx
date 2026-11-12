"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Filter,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  aggregateUsageWeeks,
  buildUsageAnalyticsQuery,
  cumulativeUsage,
  groupUsageWeeks,
  toggleUsageDaySelection,
  type UsageDay,
} from "@/lib/usage-analytics";

type Daily = UsageDay;
type ModelUsage = {
  providerId: string;
  modelId: string;
  modelName: string;
  source: string;
  messageCount: number | null;
  turnCount: number;
  invocationCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokenCoverage: number;
};
type Analytics = {
  from: string;
  to: string;
  timezone: string;
  overview: {
    totalTokens: number | null;
    highestDailyTokens: number | null;
    highestDailyComplete: boolean;
    longestActiveSessionMs: number | null;
    currentStreak: number;
    longestStreak: number;
    activeDays: number;
    totalChats: number;
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
  };
  tokenCoverage: {
    knownInvocations: number;
    invocations: number;
    complete: boolean;
  };
  messageCoverage: { complete: boolean };
  daily: Daily[];
  models: ModelUsage[];
};
type ViewMode = "daily" | "weekly" | "cumulative";

const defaultTimezone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

const today = localDate(new Date(), defaultTimezone);
const yearStart = shiftDate(today, -364);
const timezoneOptions = [
  "UTC",
  "Asia/Bangkok",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
];
const unavailableLabel = "Unavailable";
const number = (value: number | null | undefined) =>
  value == null ? unavailableLabel : value.toLocaleString();

function durationLabel(value: number | null) {
  if (value == null) return unavailableLabel;
  const minutes = Math.floor(value / 60_000);
  if (minutes < 1) return "< 1 min";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function monthLabel(day: string) {
  return day
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${day}T12:00:00Z`))
    : "";
}

function Heatmap({
  data,
  mode,
  onMode,
  selected,
  onSelect,
}: {
  data: Daily[];
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  selected: Daily | null;
  onSelect: (day: Daily) => void;
}) {
  const values = useMemo(() => {
    const weeks = groupUsageWeeks(data);
    const flat = cumulativeUsage(data);
    const weekly = aggregateUsageWeeks(weeks);
    const max = Math.max(
      1,
      ...(mode === "weekly"
        ? weekly.map((d) => d.tokens ?? d.chats)
        : mode === "cumulative"
          ? flat.map((d) => d.tokens ?? d.chats)
          : data.map((d) => d.tokens ?? d.chats)),
    );
    const intensity = (day: Daily) => {
      if (!day.date) return "bg-transparent border-transparent";
      const cumulativeDay =
        mode === "cumulative"
          ? flat.find((d) => d.date === day.date)
          : undefined;
      if (!(cumulativeDay?.complete ?? day.complete))
        return "bg-muted border-border border-dashed";
      const value = cumulativeDay?.tokens ?? day.tokens ?? 0;
      const activityValue = value || day.chats;
      if (!activityValue) return "bg-muted border-border";
      const fraction = activityValue / max;
      return fraction < 0.25
        ? "bg-emerald-200 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-950"
        : fraction < 0.5
          ? "bg-emerald-400 dark:bg-emerald-800 border-emerald-400 dark:border-emerald-800"
          : fraction < 0.75
            ? "bg-emerald-600 dark:bg-emerald-600 border-emerald-600 dark:border-emerald-600"
            : "bg-emerald-800 dark:bg-emerald-400 border-emerald-800 dark:border-emerald-400";
    };
    if (mode === "weekly") {
      return weekly.map((day) => ({
        key: day.date,
        day,
        className: intensity(day),
      }));
    }
    if (mode === "cumulative") {
      return flat.map((day) => ({
        key: day.date,
        day,
        className: intensity(day),
      }));
    }
    return weeks.flatMap((items) =>
      items.map((day, index) => ({
        key: `${day.date || "blank"}-${index}`,
        day,
        className: intensity(day),
      })),
    );
  }, [data, mode]);

  const weekRows = mode === "daily";
  const weeks = weekRows
    ? Array.from({ length: Math.ceil(values.length / 7) }, (_, i) =>
        values.slice(i * 7, i * 7 + 7),
      )
    : [];
  const rowCells = weekRows
    ? weeks.flatMap((week, col) =>
        week.map((cell, row) => ({ ...cell, row, col })),
      )
    : values.map((cell, col) => ({ ...cell, row: 0, col }));
  const dayLabel = (day: Daily) =>
    day.date
      ? `${day.periodLabel ?? (mode === "cumulative" ? `Cumulative through ${day.date}` : day.date)} · ${day.complete ? `${number(day.tokens)} tokens` : `${number(day.knownTokens)} known tokens, incomplete`} · ${day.chats} chats · ${day.messages}${day.messagesComplete ? "" : "+"} messages`
      : "No date";
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-7"
      aria-labelledby="activity-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="activity-heading" className="text-lg font-semibold tracking-tight">
            Usage activity
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Frequency and token volume for the selected dates
          </p>
        </div>
        <div
          className="flex rounded-full border border-border bg-muted/60 p-1"
          role="group"
          aria-label="Activity view"
        >
          {(
            [
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["cumulative", "Cumulative"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onMode(value)}
              aria-pressed={mode === value}
              className={`min-h-9 rounded-full px-3.5 text-xs font-medium transition-colors ${mode === value ? "bg-background text-foreground shadow-sm" : "bg-zinc-700 text-white hover:bg-zinc-600"}`}
              data-usage-mode={value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="usage-heatmap-scroll mt-6 overflow-x-auto rounded-xl bg-muted/30 px-3 py-4 pb-3 md:px-5"
        tabIndex={0}
        aria-label="Usage activity chart. Scroll horizontally."
      >
        <div className="min-w-max">
          {mode === "daily" ? (
            <div className="mb-2 grid grid-cols-[36px_1fr] gap-2">
              <div />
              <div className="flex gap-[3px] text-[11px] font-medium text-muted-foreground">
                {weeks.map((week, index) => {
                  const firstDate =
                    week.find((cell) => cell.day.date)?.day.date ?? "";
                  const priorDate =
                    weeks[index - 1]?.find((cell) => cell.day.date)?.day.date ??
                    "";
                  const month = monthLabel(firstDate);
                  const priorMonth = monthLabel(priorDate);
                  return (
                    <span key={index} className="inline-block w-6 shrink-0">
                      {month !== priorMonth ? month : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-[36px_1fr] gap-2">
            {mode === "daily" && (
              <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x, i) => (
                  <span key={x} className="h-[13px] leading-[13px]">
                    {i % 2 === 0 ? x : ""}
                  </span>
                ))}
              </div>
            )}
            <div
              className={
                mode === "daily"
                  ? "grid grid-flow-col grid-rows-7 gap-[3px]"
                  : "flex gap-[3px]"
              }
            >
              {rowCells.map(({ key, day, className, row, col }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => day.date && onSelect(day)}
                  title={dayLabel(day)}
                  aria-label={dayLabel(day)}
                  aria-pressed={selected?.date === day.date}
                  className={`grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:bg-muted ${selected?.date === day.date ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  style={
                    mode === "daily"
                      ? { gridRow: row + 1, gridColumn: col + 1 }
                      : undefined
                  }
                  disabled={!day.date}
                >
                  <span
                    aria-hidden="true"
                    className={`size-[13px] rounded-[3px] border ${className} ${mode === "daily" ? "" : "h-5 w-5"}`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="text-xs">Faded = no activity · Dashed = incomplete token data</span>
        <span className="flex items-center gap-1.5 text-xs" aria-label="Token usage intensity: low to high">
          Low <i className="ml-1 inline-block size-3 rounded-sm bg-muted" />{" "}
          <i className="inline-block size-3 rounded-sm bg-emerald-200 dark:bg-emerald-950" />{" "}
          <i className="inline-block size-3 rounded-sm bg-emerald-400 dark:bg-emerald-800" />{" "}
          <i className="inline-block size-3 rounded-sm bg-emerald-600" />{" "}
          <i className="inline-block size-3 rounded-sm bg-emerald-800 dark:bg-emerald-400" />{" "}
          High
        </span>
      </div>
      {selected && (
        <div
          className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4 text-sm"
          role="status"
        >
          <div>
            <strong className="font-semibold">{selected.periodLabel ?? selected.date}</strong>
            <p className="mt-1 leading-6 text-muted-foreground">
              {selected.active
                ? `${selected.chats} chats · ${selected.messages}${selected.messagesComplete ? "" : "+"} messages · ${selected.invocations} model calls · ${selected.complete ? `${number(selected.tokens)} tokens` : `${number(selected.knownTokens)} known tokens (incomplete)`}`
                : "No activity recorded"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close day details"
            onClick={() => onSelect(selected)}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}

export function UsageAnalytics() {
  const router = useRouter();
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [timezone, setTimezone] = useState(
    defaultTimezone,
  );
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState<ViewMode>("daily");
  const [data, setData] = useState<Analytics | null>(null);
  const [selected, setSelected] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const writeFilterToUrl = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const next = params.size ? `/usage?${params.toString()}` : "/usage";
    window.history.replaceState(null, "", next);
  };
  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("from")) setFrom(params.get("from") || yearStart);
      if (params.has("to")) setTo(params.get("to") || today);
      if (params.has("timezone")) setTimezone(params.get("timezone") || "UTC");
      if (params.has("provider")) setProvider(params.get("provider") || "");
      if (params.has("model")) setModel(params.get("model") || "");
      if (params.has("source")) setSource(params.get("source") || "");
    });
  }, []);
  const timezoneValue = timezone;
  const timezones = [...new Set([timezone, ...timezoneOptions])];
  const query = useMemo(
    () =>
      buildUsageAnalyticsQuery({
        from,
        to,
        timezone: timezoneValue,
        provider,
        model,
        source,
      }),
    [from, to, timezoneValue, provider, model, source],
  );
  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const response = await fetch(`/api/usage/analytics?${query}`, {
          cache: "no-store",
          signal,
        });
        if (response.status === 401) {
          router.replace("/signin");
          return;
        }
        if (response.status === 403) throw new Error("You do not have permission to view this usage data.");
        if (!response.ok) throw new Error("Could not load usage data.");
        setData((await response.json()) as Analytics);
        setSelected(null);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error ? reason.message : "An error occurred while loading usage data.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [query, router],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load, reload]);

  const stats = data?.overview;
  const messageTotal = stats?.totalMessages ?? 0;
  const userPercent = messageTotal
    ? Math.round(((stats?.userMessages ?? 0) / messageTotal) * 100)
    : 0;
  const assistantPercent = messageTotal
    ? Math.round(((stats?.assistantMessages ?? 0) / messageTotal) * 100)
    : 0;
  const averageTokens =
    stats?.totalTokens != null && stats.totalChats
      ? Math.round(stats.totalTokens / stats.totalChats)
      : null;
  const averageMessages = stats?.activeDays
    ? Math.round((messageTotal / stats.activeDays) * 10) / 10
    : null;
  const providers = [
    ...new Map(
      (data?.models ?? []).map((item) => [item.providerId, item.providerId]),
    ).values(),
  ];
  const availableModels = (data?.models ?? []).filter(
    (item) => !provider || item.providerId === provider,
  );
  const modelTokenMax = Math.max(1, ...(data?.models ?? []).map((item) => item.totalTokens ?? 0));
  const totalTokenLabel = data?.tokenCoverage.complete ? "Total tokens" : "Known tokens";

  return (
    <div lang="en" className="usage-dashboard mx-auto w-full max-w-[1440px] p-5 md:p-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6 md:mb-8 md:pb-7">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Activity aria-hidden="true" className="size-3.5" /> Usage analytics
          </p>
          <h1 className="m-0 text-[32px] font-semibold leading-tight tracking-[-0.04em] md:text-[38px]">
            Usage
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Model activity and conversation totals for the selected period.
          </p>
        </div>
        {(!loading || data) && (
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Refresh usage data"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh
          </button>
        )}
      </header>

      <section className="mb-6 rounded-2xl bg-muted/35 p-4 md:p-5" aria-label="Usage filters">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Filter aria-hidden="true" className="size-4 text-muted-foreground" />
          Report filters
        </div>
        <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            From
            <input id="usage-from" name="from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); writeFilterToUrl("from", e.target.value); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            To
            <input id="usage-to" name="to" type="date" value={to} min={from} max={today} onChange={(e) => { setTo(e.target.value); writeFilterToUrl("to", e.target.value); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Provider
            <select id="usage-provider" name="provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); writeFilterToUrl("provider", e.target.value); writeFilterToUrl("model", ""); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground">
              <option value="">All providers</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Model
            <select id="usage-model" name="model" value={model} onChange={(e) => { setModel(e.target.value); writeFilterToUrl("model", e.target.value); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground">
              <option value="">All models</option>
              {availableModels.map((m) => <option key={`${m.providerId}/${m.modelId}`} value={m.modelId}>{m.modelName}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Source
            <select id="usage-source" name="source" value={source} onChange={(e) => { setSource(e.target.value); writeFilterToUrl("source", e.target.value); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground">
              <option value="">All sources</option>
              <option value="local">Local</option>
              <option value="oauth">OAuth</option>
              <option value="api">API</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Time zone
            <select id="usage-timezone" name="timezone" value={timezoneValue} onChange={(e) => { setTimezone(e.target.value); writeFilterToUrl("timezone", e.target.value); }} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal text-foreground">
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="shrink-0 font-medium underline underline-offset-4">Try again</button>
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading usage data">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50" />)}
          <div className="h-72 animate-pulse rounded-2xl border border-border bg-muted/50 sm:col-span-2 xl:col-span-4" />
        </div>
      ) : data ? (
        <>
          <section className="mb-6 grid gap-3 xl:grid-cols-[1.05fr_2fr]" aria-label="Usage summary">
            <article className="flex min-h-32 flex-col justify-between rounded-2xl bg-foreground p-5 text-background">
              <div className="flex items-center justify-between gap-3 text-sm text-background/70">
                <span>{totalTokenLabel}</span>
                <Sparkles aria-hidden="true" className="size-4" />
              </div>
              <div>
                <strong className="block text-3xl font-semibold tabular-nums tracking-tight">{number(stats?.totalTokens)}</strong>
                <span className="mt-1 block text-xs text-background/65">Across recorded model calls</span>
              </div>
            </article>
            <div className="grid min-h-32 grid-cols-1 divide-y divide-border/70 rounded-2xl bg-muted/35 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <article className="flex flex-col justify-between gap-4 p-5">
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>Conversations</span><MessageSquareText aria-hidden="true" className="size-4" /></div>
                <strong className="text-2xl font-semibold tabular-nums tracking-tight">{number(stats?.totalChats)}</strong>
              </article>
              <article className="flex flex-col justify-between gap-4 p-5">
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>Active days</span><CalendarDays aria-hidden="true" className="size-4" /></div>
                <strong className="text-2xl font-semibold tabular-nums tracking-tight">{number(stats?.activeDays)}</strong>
              </article>
              <article className="flex flex-col justify-between gap-4 p-5">
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>Highest usage day</span><TrendingUp aria-hidden="true" className="size-4" /></div>
                <div>
                  <strong className="text-2xl font-semibold tabular-nums tracking-tight">{number(stats?.highestDailyTokens)}</strong>
                  {stats && !stats.highestDailyComplete && <span className="mt-1 block text-xs text-muted-foreground">Partial token data</span>}
                </div>
              </article>
            </div>
          </section>

          {!data.tokenCoverage.complete && (
            <div className="mb-5 flex flex-wrap items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <strong className="font-semibold">Token data is incomplete.</strong>
              <span className="text-muted-foreground">Complete data is available for {number(data.tokenCoverage.knownInvocations)} of {number(data.tokenCoverage.invocations)} calls. Older history is shown as unavailable.</span>
            </div>
          )}

          <Heatmap data={data.daily} mode={mode} onMode={setMode} selected={selected} onSelect={(day) => setSelected((current) => toggleUsageDaySelection(current, day))} />

          <section className="mt-5 grid items-stretch gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <article className="rounded-2xl bg-muted/30 p-5 md:p-6" aria-labelledby="detail-heading">
              <div className="mb-5">
                <h2 id="detail-heading" className="text-lg font-semibold tracking-tight">Conversation details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Counts from saved conversations and model calls.</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
                <div><dt className="text-xs text-muted-foreground">Models used</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{number(data.models.length)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Average tokens per conversation</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{number(averageTokens)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Average messages per active day</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{averageMessages == null ? unavailableLabel : averageMessages.toLocaleString()}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Longest active session</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{durationLabel(stats?.longestActiveSessionMs ?? null)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Current activity streak</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{number(stats?.currentStreak)} days</dd></div>
                <div><dt className="text-xs text-muted-foreground">Longest activity streak</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{number(stats?.longestStreak)} days</dd></div>
              </dl>
              <div className="mt-6 border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2"><MessageSquareText aria-hidden="true" className="size-4 text-muted-foreground" />Message split</span>
                  <span className="text-muted-foreground">{number(messageTotal)} total</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${userPercent}% user messages and ${assistantPercent}% assistant messages`}>
                  <span className="bg-foreground" style={{ width: `${userPercent}%` }} />
                  <span className="bg-emerald-500" style={{ width: `${assistantPercent}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-foreground" />You <strong className="font-medium text-foreground">{number(stats?.userMessages)} ({userPercent}%)</strong></span>
                  <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" />Assistant <strong className="font-medium text-foreground">{number(stats?.assistantMessages)} ({assistantPercent}%)</strong></span>
                </div>
              </div>
              {!data.messageCoverage.complete && <p className="mt-4 text-xs leading-5 text-muted-foreground">Some older conversations do not include complete message details.</p>}
            </article>

            <article className="rounded-2xl bg-muted/30 p-5 md:p-6" aria-labelledby="models-heading">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 id="models-heading" className="text-lg font-semibold tracking-tight">Model usage</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Tokens and calls by model for this period.</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{number(data.models.length)} models</span>
              </div>
              {data.models.length ? (
                <ul className="divide-y divide-border">
                  {data.models.map((item) => {
                    const tokenWidth = Math.round(((item.totalTokens ?? 0) / modelTokenMax) * 100);
                    return (
                      <li key={`${item.providerId}/${item.modelId}`} className="py-4 first:pt-1 last:pb-1">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{item.modelName}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{item.providerId} · {item.source}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{number(item.totalTokens)} <span className="font-normal text-muted-foreground">tokens</span></p>
                            <p className="mt-1 text-xs text-muted-foreground">{item.invocationCount === 0 ? "Calls unavailable" : `${number(item.invocationCount)} calls`}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${item.modelName} token share`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={tokenWidth}>
                          <span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${tokenWidth}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.messageCount == null ? `${number(item.turnCount)} turns · message detail unavailable` : `${number(item.messageCount)} ${item.messageCount === 1 ? "message" : "messages"}`}
                          {item.tokenCoverage < 1 && <span> · {Math.round(item.tokenCoverage * 100)}% token coverage</span>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="grid min-h-40 place-content-center rounded-xl border border-dashed border-border bg-muted/20 px-5 text-center">
                  <p className="text-sm font-medium">No model usage in this period</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try a wider date range or clear a filter.</p>
                </div>
              )}
            </article>
          </section>

          {!data.overview.totalChats && (
            <div className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No activity matches the selected date range and filters.</div>
          )}
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            An activity streak groups requests no more than 30 minutes apart and measures from the first request to the last. Today counts when it is in the selected range and has activity.
          </p>
        </>
      ) : null}
    </div>
  );
}
