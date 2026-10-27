import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures/insights";
import { countLabel, hasInsights, insightLines, insightText } from "./quickInsightsCopy";
import type { PortfolioInsights, PortfolioInsightsResponse } from "./types";

const family = () => fixture<PortfolioInsightsResponse>("insights_family");
const member = () => fixture<PortfolioInsightsResponse>("insights_member");
const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });
const ids = (insights: PortfolioInsights) => insightLines(insights).map(line => line.id);

// A copy of the family insights with some fields replaced, so no test depends on one fixture's numbers.
function withInsights(change: (insights: PortfolioInsights) => void): PortfolioInsights {
  const insights = family().insights;
  change(insights);
  return insights;
}

// A mixed Direct/Regular/Unclassified split with the old spec numbers. The golden family file is all Direct with one AMC,
// so the tests that need a share to round away, or an AMC that differs from the largest holding's, build that input here.
const mixedPlan = (unclassifiedPct = "0.3333") => ({
  direct: { value: "2570931.30", pct: "69.4091" },
  regular: { value: "1120750.35", pct: "30.2576" },
  unclassified: { value: "12345.67", pct: unclassifiedPct },
});

describe("countLabel", () => {
  it("uses the singular for exactly one and the plural otherwise (zero included)", () => {
    expect(countLabel(1, "fund", "funds")).toBe("1 fund");
    expect(countLabel(0, "fund", "funds")).toBe("0 funds");
    expect(countLabel(2, "AMC", "AMCs")).toBe("2 AMCs");
    expect(countLabel(23, "fund", "funds")).toBe("23 funds");
  });
});

describe("insightLines: the family fixture", () => {
  it("returns the five insights in the signed-off order", () => {
    expect(ids(family().insights)).toEqual(["largest-holding", "spread", "plan-split", "largest-amc", "sips"]);
  });

  it("writes the largest holding with the fund in bold and the share to one place", () => {
    expect(insightLines(family().insights)[0].parts).toEqual([
      plain("Your largest holding is "),
      bold("Dev Short Duration Debt"),
      plain(" — 38.6% of your total portfolio"),
    ]);
  });

  it("writes the spread with both counts in bold", () => {
    expect(insightLines(family().insights)[1].parts).toEqual([
      plain("Spread across "), bold("1 AMC"), plain(" and "), bold("4 funds"),
    ]);
  });

  it("writes the plan split in whole percents and leaves out a share that rounds to zero", () => {
    // golden family: direct 100.0000, regular 0.0000, unclassified 0.0000 (rounds to 0, so it is not mentioned)
    expect(insightLines(family().insights)[2].parts).toEqual([bold("100% Direct"), plain(", 0% Regular")]);
    // mixed split: unclassified 0.3333 also rounds to 0
    const mixed = withInsights(i => { i.plan_split = mixedPlan(); });
    expect(insightLines(mixed)[2].parts).toEqual([bold("69% Direct"), plain(", 30% Regular")]);
  });

  it("writes the largest AMC with its name and share in bold, in whole percents", () => {
    expect(insightLines(family().insights)[3].parts).toEqual([
      plain("Your largest single AMC exposure is "), bold("Home Test AMC at 100%"),
    ]);
  });

  it("names the largest AMC, not the AMC of the largest holding", () => {
    const insights = withInsights(i => {
      i.largest_holding!.amc_name = "PPFAS Mutual Fund";
      i.largest_amc = { amc_name: "HDFC Mutual Fund", value: "1690500.25", pct_of_portfolio: "45.6395", fund_count: 2 };
    });
    expect(insightLines(insights)[3].parts).toEqual([
      plain("Your largest single AMC exposure is "), bold("HDFC Mutual Fund at 46%"),
    ]);
  });

  it("writes the SIP total in rupees with Indian digit grouping", () => {
    expect(insightLines(family().insights)[4].parts).toEqual([bold("₹9,000"), plain(" in active SIPs scheduled this month")]);
  });

  it("joins the parts into plain text for each line", () => {
    expect(insightLines(family().insights).map(insightText)).toEqual([
      "Your largest holding is Dev Short Duration Debt — 38.6% of your total portfolio",
      "Spread across 1 AMC and 4 funds",
      "100% Direct, 0% Regular",
      "Your largest single AMC exposure is Home Test AMC at 100%",
      "₹9,000 in active SIPs scheduled this month",
    ]);
  });
});

describe("insightLines: the member fixture", () => {
  it("uses the member's own figures", () => {
    expect(insightLines(member().insights).map(insightText)).toEqual([
      "Your largest holding is Dev Short Duration Debt — 66.9% of your total portfolio",
      "Spread across 1 AMC and 2 funds",
      "100% Direct, 0% Regular",
      "Your largest single AMC exposure is Home Test AMC at 100%",
      "₹4,000 in active SIPs scheduled this month",
    ]);
  });
});

describe("insightLines: number formatting", () => {
  it("rounds half up on the decimal text, never through a float", () => {
    const insights = withInsights(i => {
      i.largest_amc!.amc_name = "HDFC Mutual Fund";
      i.largest_holding!.pct_of_portfolio = "14.8450";
      i.plan_split!.direct.pct = "62.5000";
      i.plan_split!.regular.pct = "37.5000";
      i.largest_amc!.pct_of_portfolio = "23.4999";
    });
    const lines = insightLines(insights).map(insightText);
    expect(lines[0]).toContain("— 14.8% of your total portfolio");
    expect(lines[2]).toBe("63% Direct, 38% Regular");
    expect(lines[3]).toBe("Your largest single AMC exposure is HDFC Mutual Fund at 23%");
    const edge = withInsights(i => { i.largest_holding!.pct_of_portfolio = "99.9500"; });
    expect(insightText(insightLines(edge)[0])).toContain("— 100.0% of your total portfolio");
  });

  it("groups lakhs and crores the Indian way", () => {
    const insights = withInsights(i => { i.sips.monthly_total = "118000.00"; });
    expect(insightText(insightLines(insights)[4])).toBe("₹1,18,000 in active SIPs scheduled this month");
    const crores = withInsights(i => { i.sips.monthly_total = "12345678.50"; });
    expect(insightText(insightLines(crores)[4])).toBe("₹1,23,45,679 in active SIPs scheduled this month");
  });

  it("uses the singular when there is one AMC or one fund", () => {
    const insights = withInsights(i => { i.spread = { fund_count: 1, amc_count: 1 }; });
    expect(insightText(insightLines(insights)[1])).toBe("Spread across 1 AMC and 1 fund");
    const mixed = withInsights(i => { i.spread = { fund_count: 4, amc_count: 1 }; });
    expect(insightText(insightLines(mixed)[1])).toBe("Spread across 1 AMC and 4 funds");
    const other = withInsights(i => { i.spread = { fund_count: 1, amc_count: 2 }; });
    expect(insightText(insightLines(other)[1])).toBe("Spread across 2 AMCs and 1 fund");
  });

  it("shows the AMC name exactly as the backend sends it", () => {
    const insights = withInsights(i => { i.largest_amc!.amc_name = "Unknown AMC"; });
    expect(insightText(insightLines(insights)[3])).toBe("Your largest single AMC exposure is Unknown AMC at 100%");
  });
});

describe("insightLines: unclassified plans", () => {
  it("adds a third share once it rounds to at least one percent", () => {
    const edge = withInsights(i => { i.plan_split = mixedPlan("0.4999"); });
    expect(insightText(insightLines(edge)[2])).toBe("69% Direct, 30% Regular");
    const shown = withInsights(i => {
      i.plan_split = {
        direct: { value: "1.00", pct: "60.0000" },
        regular: { value: "1.00", pct: "27.5000" },
        unclassified: { value: "1.00", pct: "12.5000" },
      };
    });
    expect(insightLines(shown)[2].parts).toEqual([bold("60% Direct"), plain(", 28% Regular"), plain(", 13% Unclassified")]);
    const boundary = withInsights(i => { i.plan_split = mixedPlan("0.5000"); });
    expect(insightText(insightLines(boundary)[2])).toBe("69% Direct, 30% Regular, 1% Unclassified");
  });

  it("still writes Direct and Regular when one of them is zero", () => {
    const insights = withInsights(i => {
      i.plan_split = {
        direct: { value: "9.00", pct: "100.0000" },
        regular: { value: "0.00", pct: "0.0000" },
        unclassified: { value: "0.00", pct: "0.0000" },
      };
    });
    expect(insightText(insightLines(insights)[2])).toBe("100% Direct, 0% Regular");
  });
});

describe("insightLines: lines the data cannot support are left out", () => {
  it("leaves out each insight the backend sent as null", () => {
    expect(ids(withInsights(i => { i.largest_holding = null; }))).toEqual(["spread", "plan-split", "largest-amc", "sips"]);
    expect(ids(withInsights(i => { i.plan_split = null; }))).toEqual(["largest-holding", "spread", "largest-amc", "sips"]);
    expect(ids(withInsights(i => { i.largest_amc = null; }))).toEqual(["largest-holding", "spread", "plan-split", "sips"]);
  });

  it("leaves out the spread when there are no funds", () => {
    expect(ids(withInsights(i => { i.spread = { fund_count: 0, amc_count: 0 }; }))).toEqual(
      ["largest-holding", "plan-split", "largest-amc", "sips"],
    );
  });

  it("leaves out the SIP line when no SIP is active, never writing a zero amount", () => {
    const none = fixture<PortfolioInsightsResponse>("insights_no_sips").insights;
    expect(ids(none)).toEqual(["largest-holding", "spread", "plan-split", "largest-amc"]);
    expect(insightLines(none).map(insightText).join(" ")).not.toContain("SIP");
    const zeroAmount = withInsights(i => { i.sips = { active_count: 2, monthly_total: "0.00" }; });
    expect(ids(zeroAmount)).toContain("sips");
  });

  it("returns nothing for the empty fixtures", () => {
    expect(insightLines(fixture<PortfolioInsightsResponse>("insights_empty").insights)).toEqual([]);
    expect(insightLines(fixture<PortfolioInsightsResponse>("insights_no_prices").insights)).toEqual([]);
  });

  it("does not change the data it is given", () => {
    const insights = family().insights;
    const before = JSON.stringify(insights);
    insightLines(insights);
    expect(JSON.stringify(insights)).toBe(before);
  });
});

describe("hasInsights", () => {
  it("is true for a response with something to say, partial or not", () => {
    expect(hasInsights(family())).toBe(true);
    expect(hasInsights(member())).toBe(true);
    expect(hasInsights(fixture<PortfolioInsightsResponse>("insights_partial"))).toBe(true);
    expect(hasInsights(fixture<PortfolioInsightsResponse>("insights_no_sips"))).toBe(true);
  });

  it("is false when the backend says the scope is empty, for either reason", () => {
    expect(hasInsights(fixture<PortfolioInsightsResponse>("insights_empty"))).toBe(false);
    expect(hasInsights(fixture<PortfolioInsightsResponse>("insights_no_prices"))).toBe(false);
  });

  it("is false when empty is set even if the insights block still carries values", () => {
    const body = family();
    body.empty = true;
    body.empty_reason = "no_holdings";
    expect(hasInsights(body)).toBe(false);
  });

  it("is false when no line survives", () => {
    const body = family();
    body.insights = {
      largest_holding: null,
      spread: { fund_count: 0, amc_count: 0 },
      plan_split: null,
      largest_amc: null,
      sips: { active_count: 0, monthly_total: "0.00" },
    };
    expect(hasInsights(body)).toBe(false);
  });
});
