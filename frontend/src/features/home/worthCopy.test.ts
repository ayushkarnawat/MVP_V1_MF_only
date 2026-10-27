import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import type { WorthCardOut, WorthResponse } from "./types";
import {
  comparisonBars,
  concentrationTrend,
  costScale,
  formatMonthYear,
  percentPointDifference,
  scoreChip,
  worthChip,
  worthDetail,
  worthHeadline,
} from "./worthCopy";

const cards = () => fixture<WorthResponse>("worth_three_cards").cards;
const earlier = () => fixture<WorthResponse>("worth_concentration_with_earlier").cards;
const expense: WorthCardOut = {
  kind: "high_expense", rank: 1, scheme_id: "s", scheme_name: "Summit Small Cap Fund",
  evidence: { ter: "0.95", category_avg_ter: "0.25", gap_pp: "0.70", plan_type: "direct", share_pct: "5.00" },
};

describe("formatMonthYear", () => {
  it("writes the month name and the year", () => {
    expect(formatMonthYear("2026-09-30")).toBe("Sep 2026");
    expect(formatMonthYear("2026-01-05")).toBe("Jan 2026");
    expect(formatMonthYear("2026-12-31T10:00:00Z")).toBe("Dec 2026");
  });

  it("shows a dash when there is no usable date", () => {
    expect(formatMonthYear(null)).toBe("—");
    expect(formatMonthYear("bad")).toBe("—");
    expect(formatMonthYear("2026-13-01")).toBe("—");
  });
});

describe("percentPointDifference", () => {
  it.each([
    ["25.00", "10.00", "15.00"],
    ["10.00", "25.00", "-15.00"],
    ["46.5", "41", "5.50"],
    ["0.10", "0.20", "-0.10"],
    ["100", "0", "100.00"],
    ["12.34", "12.34", "0.00"],
  ])("%s minus %s is %s, exactly", (a, b, expected) => {
    expect(percentPointDifference(a, b)).toBe(expected);
  });
});

describe("worthChip, scoreChip and headlines", () => {
  it("names the kind of card", () => {
    expect(worthChip("weak_fund")).toBe("Performance");
    expect(worthChip("underperforming")).toBe("Performance");
    expect(worthChip("high_expense")).toBe("Cost");
    expect(worthChip("concentration")).toBe("Concentration");
  });

  it("writes a headline for each kind", () => {
    const [weak, under, concentration] = cards();
    expect(worthHeadline(weak)).toBe("Asha Large Cap is among the weakest in its category");
    expect(worthHeadline(under)).toBe("Asha Flexi Cap is lagging its category");
    expect(worthHeadline(expense)).toBe("Summit Small Cap Fund costs more than its category");
    expect(worthHeadline(concentration)).toBe("A large share of your portfolio sits in a few stocks");
  });

  it("says the portfolio is becoming more concentrated only when the earlier share is lower", () => {
    const concentration = earlier()[2];
    expect(worthHeadline(concentration)).toBe("Your portfolio is becoming more concentrated");
    const same = { ...concentration, evidence: { ...concentration.evidence, earlier_top5_pct: "30.00" } };
    expect(worthHeadline(same)).toBe("A large share of your portfolio sits in a few stocks");
  });

  it("gives the score chip of a weak fund from its final score, with the kit's band colour", () => {
    const chip = scoreChip(cards()[0]);
    expect(chip?.text).toBe("Score: Weak");
    expect(chip?.color).toBe("#EA580C");
    expect(scoreChip(cards()[1])).toBeNull();
    expect(scoreChip({ ...cards()[0], evidence: { ...cards()[0].evidence, final_score: null } })).toBeNull();
  });
});

describe("worthDetail", () => {
  it("describes a weak fund by its share of the portfolio", () => {
    expect(worthDetail(cards()[0])).toBe(
      "This fund is 23.2% of your portfolio and sits in the lowest group for its category.",
    );
  });

  it("describes the cost gap in percentage points", () => {
    expect(worthDetail(expense)).toBe("0.70 percentage points above the average for the same plan type.");
  });

  it("has no detail line for the other kinds", () => {
    expect(worthDetail(cards()[1])).toBe("");
    expect(worthDetail(cards()[2])).toBe("");
  });
});

describe("costScale", () => {
  it("places the category average and the fund on a scale of at least 1.5", () => {
    expect(costScale("0.95", "0.25")).toEqual({ tick: 16.7, dot: 63.3 });
  });

  it("grows the scale when a cost is above 1.5", () => {
    expect(costScale("3.00", "1.50")).toEqual({ tick: 50, dot: 100 });
  });

  it("never leaves the track", () => {
    expect(costScale("0.00", "0.00")).toEqual({ tick: 0, dot: 0 });
  });
});

describe("comparisonBars", () => {
  it("sizes both bars against the larger return and puts losses left of the middle", () => {
    expect(comparisonBars("-6.20", "3.10")).toEqual({
      fund: { width: 50, side: "loss" },
      category: { width: 25, side: "gain" },
    });
  });

  it("uses a floor of 1 percentage point so a tiny return does not fill the track", () => {
    expect(comparisonBars("0.20", "0.10")).toEqual({
      fund: { width: 10, side: "gain" },
      category: { width: 5, side: "gain" },
    });
  });

  it("treats zero as a gain with no width", () => {
    expect(comparisonBars("0", "0")).toEqual({ fund: { width: 0, side: "gain" }, category: { width: 0, side: "gain" } });
  });
});

describe("concentrationTrend", () => {
  it("is null without an earlier share", () => {
    expect(concentrationTrend(cards()[2].evidence)).toBeNull();
  });

  it("shows the change in points and the earlier share", () => {
    expect(concentrationTrend(earlier()[2].evidence)).toEqual({ chip: "▲ 15 pts", earlier: "10% earlier" });
  });

  it("points down when the share fell, and says no change for under half a point", () => {
    expect(concentrationTrend({ top5_pct: "20.00", earlier_top5_pct: "25.00" })).toEqual({ chip: "▼ 5 pts", earlier: "25% earlier" });
    expect(concentrationTrend({ top5_pct: "20.20", earlier_top5_pct: "20.00" })).toEqual({ chip: "No change", earlier: "20% earlier" });
  });
});
