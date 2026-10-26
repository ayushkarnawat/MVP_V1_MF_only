import { describe, expect, it } from "vitest";
import * as copy from "./planningCopy";

describe("approved wording (L39), verbatim", () => {
  it.each([
    ["TITLE", "Planning"],
    ["SUBTITLE", "Explore different financial scenarios to plan better and make more informed decisions."],
    ["PLAN_FUTURE_TITLE", "Plan your future"],
    ["PLAN_FUTURE_LINE", "Set goals, adjust assumptions and see how your wealth can grow over time."],
    ["EXPLORE_TITLE", "Explore market scenarios"],
    ["EXPLORE_LINE", "See how your portfolio might perform in historical and hypothetical market events."],
    ["COMING_SOON_TITLE", "Coming soon"],
    ["COMING_SOON_LINE", "Goal planning is on its way: retirement, your child's education, a home purchase and wealth goals."],
    ["BACK_LABEL", "Back to Planning"],
    ["MARKET_SUBTITLE", "Here's what this portfolio would have captured during these periods, based on actual historical fund performance."],
    ["COMPLIANCE_COPY", "Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns."],
    ["ONGOING_SUFFIX", " Numbers will update as the event continues."],
    ["NIFTY_CAVEAT", "Compared with an equity index. Debt and gold funds in your portfolio do not move like it."],
    ["PRE_2006_NOTE", "Fund prices were not reported before 2006, so only the index is shown for this event."],
    ["NO_HOLDINGS_TITLE", "You have no funds to replay yet."],
    ["NO_HOLDINGS_LINE", "Import a statement to see how your funds would have done."],
    ["IMPORT_LABEL", "Import a statement"],
    ["LIST_ERROR", "Scenarios aren't available right now."],
    ["TRY_AGAIN", "Try again"],
    ["NO_SCENARIOS", "No scenarios are available yet."],
    ["NO_DATA", "Not enough historical data to estimate"],
    ["NO_CHANGE", "No change to show"],
    ["MIRA_TITLE", "Insights from Mira"],
    ["MIRA_LINE", "Coming soon. Mira will point out what mattered most in each event."],
    ["MIRA_BUTTON", "Learn more"],
    ["FREEZE_HEADLINE", "This wasn't a price fall — a ~20-month liquidity freeze"],
    ["FREEZE_BIG", "Frozen, not %"],
    ["NONE_FROZEN", "None of your funds were frozen in this event"],
    ["FAMILY_COMBINED", "Family combined"],
    ["FROZEN_TEXT", "Redemptions frozen"],
    ["NO_MEMBER_HOLDINGS", "No holdings for this member."],
  ])("%s", (name, text) => {
    expect((copy as Record<string, unknown>)[name]).toBe(text);
  });

  it("has no straight apostrophe lookalikes or hyphen-for-dash slips in the long lines", () => {
    expect(copy.COMPLIANCE_COPY).toContain(" — ");
    expect(copy.FREEZE_HEADLINE).toContain(" — ");
  });
});

describe("outperformText", () => {
  it("says Outperformed for a positive gap and Behind for a negative one, shown to one decimal", () => {
    expect(copy.outperformText("13.11")).toBe("Outperformed by 13.1 percentage points");
    expect(copy.outperformText("-2.00")).toBe("Behind by 2.0 percentage points");
    expect(copy.outperformText("-13.02")).toBe("Behind by 13.0 percentage points");
    expect(copy.outperformText("0.00")).toBe("Outperformed by 0.0 percentage points");
    expect(copy.outperformText("0.05")).toBe("Outperformed by 0.1 percentage points");
  });
});

describe("proxyLabel", () => {
  it("names the basis of an estimate", () => {
    expect(copy.proxyLabel("sebi_category_average:Equity Scheme - Flexi Cap Fund|Equity")).toBe("Category average estimate");
    expect(copy.proxyLabel("asset_class_average:Gold")).toBe("Asset-class average estimate");
    expect(copy.proxyLabel(null)).toBe("Asset-class average estimate");
    expect(copy.proxyLabel("no_comparable_data")).toBe("Asset-class average estimate");
  });
});

describe("coverage wording", () => {
  it("says how many funds have no data, singular and plural", () => {
    expect(copy.noDataFunds(1)).toBe("1 fund has no data for this period");
    expect(copy.noDataFunds(4)).toBe("4 funds have no data for this period");
  });

  it("states what an asset-class chart covers, in Indian grouping, or nothing when unknown", () => {
    expect(copy.coversCaption("7120000.00", "7410000")).toBe("Covers ₹71,20,000 of ₹74,10,000. Funds with no data are left out.");
    expect(copy.coversCaption(null, "7410000")).toBeNull();
    expect(copy.coversCaption("100", null)).toBeNull();
  });
});
