import { describe, expect, it } from "vitest";
import type { PortfolioInsightsResponse } from "../../types";
import { FIXTURE_NAMES, FIXTURE_STATUS, fixture } from "./index";

// The contract guard for the Quick Insights fixtures, which are the backend's golden files (see index.ts). It checks
// every file against section 5 of the backend handoff and re-derives the numbers in whole paise (BigInt) from the
// fund values the golden files themselves expose, so a stale or edited number fails here. The files are generated from
// the backend's home fixture: Asha and Dev, four funds, all of one AMC ("Home Test AMC"), all Direct plans.
const KEYS = [
  "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
  "members", "total_value", "empty", "empty_reason", "insights",
];
const INSIGHT_KEYS = ["largest_holding", "spread", "plan_split", "largest_amc", "sips"];
const NAMES = [
  "insights_empty", "insights_family", "insights_member", "insights_no_prices", "insights_no_sips", "insights_partial",
];
const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";

const paise = (value: string) => {
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole + frac.padEnd(2, "0").slice(0, 2));
};
// value / total * 100 to four places, rounded half up, from whole paise
const pct4 = (value: bigint, total: bigint) => {
  const scaled = (value * 1000000n + total / 2n) / total;
  return `${scaled / 10000n}.${(scaled % 10000n).toString().padStart(4, "0")}`;
};
const get = (name: string) => fixture<PortfolioInsightsResponse>(name);

// The values the golden files expose. Dev holds two funds: Short Duration Debt (the largest holding of every file) and
// Gold, which is the one fund the partial file leaves out. Asha holds the rest of the family total.
const DEBT = "cf09c887-92a1-5b49-a624-7f067ed6a2c8";
const GOLD = "7c906599-2ff8-5de4-83f9-b94651c683f2";
const DEBT_VALUE = paise("2042.04");
const GOLD_VALUE = paise(get("insights_member").total_value) - DEBT_VALUE;

describe("Quick Insights golden fixtures", () => {
  it("has the six files the backend generates, and says they are the backend golden files", () => {
    expect(FIXTURE_NAMES).toEqual(NAMES);
    expect(FIXTURE_STATUS).toBe("BACKEND GOLDEN");
  });

  it("throws for a name that does not exist, and returns a copy each time", () => {
    expect(() => fixture("nope")).toThrow("unknown Quick Insights fixture: nope");
    const first = get("insights_family");
    first.total_value = "changed";
    expect(get("insights_family").total_value).toBe("5288.34");
  });

  it.each(NAMES)("%s has exactly the contract's fields", name => {
    const body = get(name);
    expect(Object.keys(body).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(body.insights).sort()).toEqual([...INSIGHT_KEYS].sort());
    expect(body.computed_at).toMatch(/Z$/);
    expect(typeof body.total_value).toBe("string");
    expect(typeof body.insights.sips.monthly_total).toBe("string");
    expect(Number.isInteger(body.insights.sips.active_count)).toBe(true);
  });

  it.each(NAMES)("%s: plan values add up to the total to the paisa and percentages have four places", name => {
    const body = get(name);
    const plan = body.insights.plan_split;
    if (plan === null) {
      expect(body.empty).toBe(true);
      return;
    }
    expect(paise(plan.direct.value) + paise(plan.regular.value) + paise(plan.unclassified.value)).toBe(paise(body.total_value));
    for (const entry of [plan.direct, plan.regular, plan.unclassified]) {
      expect(entry.pct).toMatch(/^\d+\.\d{4}$/);
      expect(entry.value).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("derives the family numbers from the member and partial files", () => {
    const body = get("insights_family");
    const dev = get("insights_member");
    const partial = get("insights_partial");
    const total = paise(body.total_value);
    // Dev's two funds are Debt and Gold; the family adds Asha's two (Flexi Cap and Large Cap) on top of Dev's total.
    expect(GOLD_VALUE).toBe(paise("1010.00"));
    expect(paise(dev.total_value)).toBe(DEBT_VALUE + GOLD_VALUE);
    expect(body.total_value).toBe("5288.34");
    expect(total - paise(dev.total_value)).toBe(paise("2236.30"));
    // The partial file is the family without Gold, which it names as the fund without a price.
    expect(total - GOLD_VALUE).toBe(paise(partial.total_value));
    const largest = body.insights.largest_holding!;
    expect(largest.scheme_id).toBe(DEBT);
    expect(largest.fund_name).toBe("Dev Short Duration Debt");
    expect(largest.value).toBe("2042.04");
    expect(paise(largest.value)).toBe(DEBT_VALUE);
    expect(largest.pct_of_portfolio).toBe(pct4(DEBT_VALUE, total));
    expect(largest.pct_of_portfolio).toBe("38.6140");
    expect(body.insights.spread).toEqual({ fund_count: 4, amc_count: 1 });
    const plans = body.insights.plan_split!;
    expect(plans.direct).toEqual({ value: "5288.34", pct: pct4(total, total) });
    expect(plans.regular).toEqual({ value: "0.00", pct: "0.0000" });
    expect(plans.unclassified).toEqual({ value: "0.00", pct: "0.0000" });
    expect(plans.direct.pct).toBe("100.0000");
    // One AMC holds everything, so its value is the whole total and it holds all four funds.
    expect(body.insights.largest_amc).toEqual({
      amc_name: "Home Test AMC", value: "5288.34", pct_of_portfolio: pct4(total, total), fund_count: 4,
    });
    expect(body.insights.largest_amc!.pct_of_portfolio).toBe("100.0000");
    expect(body.insights.sips).toEqual({ active_count: 3, monthly_total: "9000.00" });
  });

  it("has one AMC for the whole book, so the largest AMC and the largest holding share a name and the AMC covers every fund", () => {
    // The old spec fixture kept the two AMC names apart to make a mix-up show; the backend data cannot. The copy tests
    // cover that mix-up with their own input, and here we pin what the golden data does say.
    const body = get("insights_family");
    expect(body.insights.largest_holding!.amc_name).toBe("Home Test AMC");
    expect(body.insights.largest_amc!.amc_name).toBe("Home Test AMC");
    expect(body.insights.largest_amc!.fund_count).toBe(body.insights.spread.fund_count);
    expect(paise(body.insights.largest_amc!.value)).toBe(paise(body.total_value));
  });

  it("family lists two members and all five insights", () => {
    const body = get("insights_family");
    expect(body.scope).toBe("aggregate");
    expect(body.members!.map(member => member.id)).toEqual([ASHA, DEV]);
    expect(body.empty).toBe(false);
    expect(body.empty_reason).toBeNull();
    expect(body.partial).toBe(false);
    expect(body.insights.largest_holding).not.toBeNull();
    expect(body.insights.plan_split).not.toBeNull();
    expect(body.insights.largest_amc).not.toBeNull();
    expect(body.insights.sips.active_count).toBeGreaterThan(0);
  });

  it("member is a member-scope response without the members list", () => {
    const body = get("insights_member");
    expect(body.scope).toBe("member");
    expect(body.member_id).toBe(DEV);
    expect(body.members).toBeNull();
    expect(body.total_value).toBe("3052.04");
    expect(body.insights.spread).toEqual({ fund_count: 2, amc_count: 1 });
    expect(body.insights.largest_holding!.scheme_id).toBe(DEBT);
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe(pct4(DEBT_VALUE, paise("3052.04")));
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe("66.9074");
    expect(body.insights.plan_split!.direct).toEqual({ value: "3052.04", pct: "100.0000" });
    // Two parallel SIPs (the backend seeds Dev with twins) add up to 4000.
    expect(body.insights.sips).toEqual({ active_count: 2, monthly_total: "4000.00" });
  });

  it("empty has no holdings: every insight null except sips and the spread zero", () => {
    const body = get("insights_empty");
    expect(body.empty).toBe(true);
    expect(body.empty_reason).toBe("no_holdings");
    expect(body.total_value).toBe("0.00");
    expect(body.insights.largest_holding).toBeNull();
    expect(body.insights.plan_split).toBeNull();
    expect(body.insights.largest_amc).toBeNull();
    expect(body.insights.spread).toEqual({ fund_count: 0, amc_count: 0 });
    expect(body.insights.sips).toEqual({ active_count: 0, monthly_total: "0.00" });
    expect(body.members!.every(member => !member.has_data)).toBe(true);
  });

  it("partial names the fund without a NAV and leaves it out of the total and the counts", () => {
    const body = get("insights_partial");
    const family = get("insights_family");
    expect(body.partial).toBe(true);
    expect(body.missing_funds).toEqual([{ scheme_id: GOLD, name: "Dev Gold Fund" }]);
    const total = paise(family.total_value) - GOLD_VALUE;
    expect(paise(body.total_value)).toBe(total);
    expect(body.total_value).toBe("4278.34");
    expect(body.insights.spread).toEqual({ fund_count: 3, amc_count: 1 });
    expect(body.insights.plan_split!.unclassified).toEqual({ value: "0.00", pct: "0.0000" });
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe(pct4(DEBT_VALUE, total));
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe("47.7297");
  });

  it("no_sips has zero SIPs and the other four insights", () => {
    const body = get("insights_no_sips");
    expect(body.insights.sips).toEqual({ active_count: 0, monthly_total: "0.00" });
    expect(body.empty).toBe(false);
    expect(body.insights.largest_holding).not.toBeNull();
    expect(body.insights.plan_split).not.toBeNull();
    expect(body.insights.largest_amc).not.toBeNull();
    // The no-SIP build leaves out the seeded SIP transactions, so its holdings differ a little from the family file.
    expect(body.total_value).toBe("5212.00");
    expect(body.insights.largest_holding!.value).toBe("2002.00");
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe(pct4(paise("2002.00"), paise("5212.00")));
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe("38.4114");
    expect(body.insights.spread).toEqual({ fund_count: 4, amc_count: 1 });
  });

  it("no_prices has holdings but no price at all", () => {
    const body = get("insights_no_prices");
    expect(body.empty).toBe(true);
    expect(body.empty_reason).toBe("no_prices");
    expect(body.partial).toBe(true);
    expect(body.missing_funds.length).toBeGreaterThan(0);
    expect(body.missing_funds.map(fund => fund.name)).toEqual([
      "Asha Flexi Cap", "Asha Large Cap", "Dev Gold Fund", "Dev Short Duration Debt",
    ]);
    expect(body.nav_as_of).toBeNull();
    expect(body.total_value).toBe("0.00");
    expect(body.insights.largest_holding).toBeNull();
    // has_data means "has a confirmed import", not "has holdings": both members have data although nothing is priced.
    expect(body.members!.every(member => member.has_data)).toBe(true);
  });
});
