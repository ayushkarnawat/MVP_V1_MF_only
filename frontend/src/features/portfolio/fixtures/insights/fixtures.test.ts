import { describe, expect, it } from "vitest";
import type { PortfolioInsightsResponse } from "../../types";
import { FIXTURE_NAMES, FIXTURE_STATUS, fixture } from "./index";

// The contract guard for the Quick Insights SPEC fixtures (see index.ts). It checks every file against section 5 of the
// backend handoff and re-derives the family numbers from the six funds below in whole paise (BigInt), so a wrong
// hand-built number fails here. When the backend golden files replace the spec files this test must keep passing.
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

// scheme_id, AMC, plan, value of the six funds the family and member files are built from
const FUNDS: [string, string, "direct" | "regular" | "unclassified", string][] = [
  ["120841", "PPFAS Mutual Fund", "direct", "1220931.30"],
  ["118955", "HDFC Mutual Fund", "direct", "1050000.00"],
  ["100174", "HDFC Mutual Fund", "regular", "640500.25"],
  ["103504", "SBI Mutual Fund", "regular", "480250.10"],
  ["118778", "Nippon India Mutual Fund", "direct", "300000.00"],
  ["120503", "ICICI Prudential Mutual Fund", "unclassified", "12345.67"],
];

describe("Quick Insights spec fixtures", () => {
  it("has the six files the backend will generate, and says they are spec fixtures", () => {
    expect(FIXTURE_NAMES).toEqual(NAMES);
    expect(FIXTURE_STATUS).toBe("SPEC FIXTURE");
  });

  it("throws for a name that does not exist, and returns a copy each time", () => {
    expect(() => fixture("nope")).toThrow("unknown Quick Insights fixture: nope");
    const first = get("insights_family");
    first.total_value = "changed";
    expect(get("insights_family").total_value).toBe("3704027.32");
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

  it("derives the family numbers from the six funds", () => {
    const body = get("insights_family");
    const total = FUNDS.reduce((sum, fund) => sum + paise(fund[3]), 0n);
    expect(body.total_value).toBe("3704027.32");
    expect(paise(body.total_value)).toBe(total);
    const largest = body.insights.largest_holding!;
    expect(largest.scheme_id).toBe("120841");
    expect(largest.value).toBe("1220931.30");
    expect(largest.pct_of_portfolio).toBe(pct4(paise("1220931.30"), total));
    expect(largest.pct_of_portfolio).toBe("32.9623");
    expect(body.insights.spread).toEqual({ fund_count: 6, amc_count: 5 });
    const plans = body.insights.plan_split!;
    for (const plan of ["direct", "regular", "unclassified"] as const) {
      const value = FUNDS.filter(fund => fund[2] === plan).reduce((sum, fund) => sum + paise(fund[3]), 0n);
      expect(paise(plans[plan].value)).toBe(value);
      expect(plans[plan].pct).toBe(pct4(value, total));
    }
    expect([plans.direct.pct, plans.regular.pct, plans.unclassified.pct]).toEqual(["69.4091", "30.2576", "0.3333"]);
    const hdfc = paise("1050000.00") + paise("640500.25");
    expect(body.insights.largest_amc).toEqual({
      amc_name: "HDFC Mutual Fund", value: "1690500.25", pct_of_portfolio: pct4(hdfc, total), fund_count: 2,
    });
    expect(body.insights.largest_amc!.pct_of_portfolio).toBe("45.6395");
    expect(body.insights.sips).toEqual({ active_count: 3, monthly_total: "17000.00" });
  });

  it("keeps the largest AMC different from the AMC of the largest holding (so a mix-up shows)", () => {
    const body = get("insights_family");
    expect(body.insights.largest_holding!.amc_name).toBe("PPFAS Mutual Fund");
    expect(body.insights.largest_amc!.amc_name).toBe("HDFC Mutual Fund");
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
    expect(body.total_value).toBe("2001181.40");
    expect(body.insights.spread).toEqual({ fund_count: 3, amc_count: 3 });
    expect(body.insights.sips).toEqual({ active_count: 1, monthly_total: "5000.00" });
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
    expect(body.partial).toBe(true);
    expect(body.missing_funds).toEqual([{ scheme_id: "120503", name: "ICICI Prudential Liquid Fund - Growth" }]);
    const rest = FUNDS.filter(fund => fund[0] !== "120503");
    const total = rest.reduce((sum, fund) => sum + paise(fund[3]), 0n);
    expect(paise(body.total_value)).toBe(total);
    expect(body.total_value).toBe("3691681.65");
    expect(body.insights.spread).toEqual({ fund_count: 5, amc_count: 4 });
    expect(body.insights.plan_split!.unclassified).toEqual({ value: "0.00", pct: "0.0000" });
    expect(body.insights.largest_holding!.pct_of_portfolio).toBe(pct4(paise("1220931.30"), total));
  });

  it("no_sips has zero SIPs and the other four insights", () => {
    const body = get("insights_no_sips");
    expect(body.insights.sips).toEqual({ active_count: 0, monthly_total: "0.00" });
    expect(body.empty).toBe(false);
    expect(body.insights.largest_holding).not.toBeNull();
    expect(body.insights.plan_split).not.toBeNull();
    expect(body.insights.largest_amc).not.toBeNull();
    expect(body.insights.spread.fund_count).toBe(6);
  });

  it("no_prices has holdings but no price at all", () => {
    const body = get("insights_no_prices");
    expect(body.empty).toBe(true);
    expect(body.empty_reason).toBe("no_prices");
    expect(body.partial).toBe(true);
    expect(body.missing_funds.length).toBeGreaterThan(0);
    expect(body.total_value).toBe("0.00");
    expect(body.insights.largest_holding).toBeNull();
  });
});
