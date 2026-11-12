export type UsageDay = {
  date: string;
  periodLabel?: string;
  tokens: number | null;
  knownTokens: number;
  invocations: number;
  chats: number;
  messages: number;
  messagesComplete: boolean;
  active: boolean;
  complete: boolean;
};

export type UsageFilters = {
  from: string;
  to: string;
  timezone: string;
  provider?: string;
  model?: string;
  source?: string;
};

export function buildUsageAnalyticsQuery(filters: UsageFilters): string {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    timezone: filters.timezone,
  });
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.model) params.set("model", filters.model);
  if (filters.source) params.set("source", filters.source);
  return params.toString();
}

function mondayIndex(day: string) {
  return (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
}

function blankDay(): UsageDay {
  return {
    date: "", tokens: 0, knownTokens: 0, invocations: 0, chats: 0,
    messages: 0, messagesComplete: true, active: false, complete: true,
  };
}

export function groupUsageWeeks(data: UsageDay[]): UsageDay[][] {
  const weeks: UsageDay[][] = [];
  let week: UsageDay[] = [];
  for (let i = 0; i < mondayIndex(data[0]?.date ?? "1970-01-05"); i++) {
    week.push(blankDay());
  }
  for (const day of data) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) {
    while (week.length < 7) week.push(blankDay());
    weeks.push(week);
  }
  return weeks;
}

export function cumulativeUsage(data: UsageDay[]): UsageDay[] {
  let total = 0;
  let complete = true;
  return data.map((day) => {
    total += day.knownTokens;
    complete = complete && day.complete;
    return { ...day, complete, tokens: complete ? total : null };
  });
}

export function aggregateUsageWeeks(weeks: UsageDay[][]): UsageDay[] {
  return weeks.map((items) => {
    const days = items.filter((day) => day.date);
    const knownTokens = days.reduce((sum, day) => sum + day.knownTokens, 0);
    const complete = days.every((day) => day.complete);
    const firstDay = days[0]?.date ?? "";
    const lastDay = days.at(-1)?.date ?? firstDay;
    return {
      ...days[0],
      date: firstDay,
      periodLabel: `Week ${firstDay} – ${lastDay} (Mon–Sun)`,
      tokens: complete ? knownTokens : null,
      knownTokens,
      active: days.some((day) => day.active),
      chats: days.reduce((sum, day) => sum + day.chats, 0),
      messages: days.reduce((sum, day) => sum + day.messages, 0),
      messagesComplete: days.every((day) => day.messagesComplete),
      invocations: days.reduce((sum, day) => sum + day.invocations, 0),
      complete,
    };
  });
}

export function toggleUsageDaySelection(current: UsageDay | null, clicked: UsageDay): UsageDay | null {
  return current?.date === clicked.date ? null : clicked;
}
