import { describe, expect, it } from "vitest";
import { buildGlanceSentence, buildStatusSentence, periodLabel, periodNote, wealthCaption } from "./homeCopy";
import { fixture } from "./fixtures";
import type { MoversResponse, SummaryResponse, WealthSeriesResponse } from "./types";

const summary = (name = "summary_family", changes: Partial<SummaryResponse> = {}) => ({
  ...fixture<SummaryResponse>(name), ...changes,
});
const movers = (name = "movers_sector", changes: Partial<MoversResponse> = {}) => ({
  ...fixture<MoversResponse>(name), ...changes,
});

describe("periodLabel", () => {
  it.each([
    ["1D", "today"], ["1W", "this week"], ["1M", "this month"], ["1Y", "this year"], ["custom", "in range"],
  ] as const)("%s is '%s'", (period, label) => {
    expect(periodLabel(period)).toBe(label);
  });
});

describe("wealthCaption", () => {
  it("names the family or the member", () => {
    expect(wealthCaption("aggregate")).toBe("Your family's wealth");
    expect(wealthCaption("aggregate", "Asha")).toBe("Your family's wealth");
    expect(wealthCaption("member", "Dev Rao")).toBe("Dev Rao's wealth");
  });

  it("falls back to a plain caption when a member has no name", () => {
    expect(wealthCaption("member")).toBe("Your wealth");
    expect(wealthCaption("member", null)).toBe("Your wealth");
    expect(wealthCaption("member", "  ")).toBe("Your wealth");
  });
});

describe("periodNote", () => {
  it("explains the two NAV days of a 1D view with the dates of its two points", () => {
    const data = fixture<WealthSeriesResponse>("wealth_1d_family");
    expect(periodNote("1D", data)).toBe(
      "1D compares two NAV days (22 Oct and 23 Oct). Mutual fund NAVs publish once a day, so there is no intraday line.",
    );
  });

  it("is empty for other periods, for a 1D view without two points, and without data", () => {
    expect(periodNote("1M", fixture<WealthSeriesResponse>("wealth_1m_family_benchmark"))).toBe("");
    const one = fixture<WealthSeriesResponse>("wealth_1d_family");
    one.points = one.points.slice(0, 1);
    expect(periodNote("1D", one)).toBe("");
    expect(periodNote("1D", null)).toBe("");
  });
});

describe("buildStatusSentence (the greeting's sentence)", () => {
  it("says how much the portfolio moved and what drove it", () => {
    expect(buildStatusSentence(summary())).toBe(
      "Your family portfolio is up ₹12 (0.23%) today. Asha Large Cap drove most of the gains.",
    );
  });

  it("names the losses for a down day, with the sign removed from the amount", () => {
    const text = buildStatusSentence(summary("summary_family", {
      direction: "down", status_phrase: "down", change_amount: "-38400.00", change_pct: "-0.1800",
      top_contributor: "Beta Flexi",
    }));
    expect(text).toBe("Your family portfolio is down ₹38,400 (0.18%) today. Beta Flexi drove most of the losses.");
  });

  it("uses the since-label as given and the member's scope label", () => {
    const text = buildStatusSentence(summary("summary_member", {
      since_label: "since Thursday's close", scope_label: "Dev Rao's portfolio",
    }));
    expect(text?.startsWith("Dev Rao's portfolio is ")).toBe(true);
    expect(text).toContain(" since Thursday's close.");
  });

  it("leaves out the percentage and the driver when they are not known", () => {
    const text = buildStatusSentence(summary("summary_family", { change_pct: null, top_contributor: null }));
    expect(text).toBe("Your family portfolio is up ₹12 today.");
  });

  it("says little changed on a flat day, without a driver", () => {
    const text = buildStatusSentence(summary("summary_family", {
      direction: "flat", status_phrase: "little changed", change_amount: "0.00", change_pct: "0.0000",
    }));
    expect(text).toBe("Your family portfolio is little changed today.");
  });

  it("is null when there are no holdings", () => {
    expect(buildStatusSentence(summary("summary_empty"))).toBeNull();
  });
});

describe("buildGlanceSentence (the Mira card's sentence)", () => {
  it("matches the signed-off wording for a gain, naming the top mover in lower case", () => {
    const top = movers("movers_sector", {
      gains: [{ key: "Banks and financials", label: "Banks and financials", change: "38400.00", funds: [] }],
    });
    expect(buildGlanceSentence(summary("summary_family", { change_amount: "38400.00" }), top)).toBe(
      "Your portfolio gained ₹38,400 today, with banks and financials contributing the most.",
    );
  });

  it("describes a loss with the biggest loser", () => {
    const down = movers("movers_all_down");
    const text = buildGlanceSentence(summary("summary_family", {
      direction: "down", status_phrase: "down", change_amount: "-3.60",
    }), down);
    expect(text).toBe(`Your portfolio lost ₹4 today, with ${down.losses[0].label.toLowerCase()} weighing on it the most.`);
  });

  it("drops the clause when there are no movers", () => {
    expect(buildGlanceSentence(summary(), null)).toBe("Your portfolio gained ₹12 today.");
    expect(buildGlanceSentence(summary(), movers("movers_empty"))).toBe("Your portfolio gained ₹12 today.");
  });

  it("uses the since-label instead of 'today' when it is not today", () => {
    const text = buildGlanceSentence(summary("summary_weekend"), null);
    expect(text).toContain(summary("summary_weekend").since_label);
    expect(text).not.toContain(" today");
  });

  it("says little changed on a flat day and is null without holdings", () => {
    const flat = summary("summary_family", { direction: "flat", status_phrase: "little changed", change_amount: "0.00" });
    expect(buildGlanceSentence(flat, movers())).toBe("Your portfolio is little changed today.");
    expect(buildGlanceSentence(summary("summary_empty"), null)).toBeNull();
  });
});
