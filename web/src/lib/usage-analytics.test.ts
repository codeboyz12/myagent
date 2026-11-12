import { describe, expect, it } from "vitest";

import {
  aggregateUsageWeeks,
  buildUsageAnalyticsQuery,
  cumulativeUsage,
  groupUsageWeeks,
  toggleUsageDaySelection,
  type UsageDay,
} from "@/lib/usage-analytics";

const day = (date: string, knownTokens: number, complete = true): UsageDay => ({
  date,
  tokens: complete ? knownTokens : null,
  knownTokens,
  invocations: 1,
  chats: 1,
  messages: 2,
  messagesComplete: true,
  active: true,
  complete,
});

describe("usage analytics dashboard data", () => {
  it("serializes all selected filters for the backend request", () => {
    const query = new URLSearchParams(buildUsageAnalyticsQuery({
      from: "2026-11-01",
      to: "2026-11-30",
      timezone: "Asia/Bangkok",
      provider: "chatgpt-plan",
      model: "gpt-6-luna",
      source: "oauth",
    }));

    expect(Object.fromEntries(query)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      timezone: "Asia/Bangkok",
      provider: "chatgpt-plan",
      model: "gpt-6-luna",
      source: "oauth",
    });
    expect(buildUsageAnalyticsQuery({ from: "a", to: "b", timezone: "UTC" }))
      .not.toContain("provider=");
  });

  it("aggregates actual Monday-based week totals and boundaries", () => {
    const weeks = groupUsageWeeks([
      day("2026-11-11", 7), // Wednesday
      day("2026-11-12", 5),
    ]);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0].date).toBe("");
    const [week] = aggregateUsageWeeks(weeks);
    expect(week.tokens).toBe(12);
    expect(week.chats).toBe(2);
    expect(week.periodLabel).toContain("Mon–Sun");
  });

  it("carries incomplete coverage forward in cumulative mode", () => {
    const result = cumulativeUsage([
      day("2026-11-11", 7),
      day("2026-11-12", 4, false),
      day("2026-11-13", 5),
    ]);
    expect(result.map((item) => item.tokens)).toEqual([7, null, null]);
    expect(result[2].complete).toBe(false);
  });

  it("toggles an inspected heatmap day on click", () => {
    const selected = day("2026-11-11", 7);
    expect(toggleUsageDaySelection(null, selected)).toBe(selected);
    expect(toggleUsageDaySelection(selected, selected)).toBeNull();
    expect(toggleUsageDaySelection(selected, day("2026-11-12", 4))?.date)
      .toBe("2026-11-12");
  });
});
