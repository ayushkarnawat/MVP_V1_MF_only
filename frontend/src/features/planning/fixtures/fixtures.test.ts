import { describe, expect, it } from "vitest";
import { sumDecimalStrings } from "@/lib/decimal";
import { ASSET_GROUPS } from "../types";
import type { ScenarioResult, ScenarioSummary } from "../types";
import { FIXTURE_NAMES, FIXTURE_STATUS, fixture } from "./index";

// The contract guard: it checks every file against Appendix A of the Planning backend handoff.
// When the real backend fixtures replace the spec ones, this test must still pass.
const RESULT_NAMES = FIXTURE_NAMES.filter(name => name.startsWith("results_"));
const RESULT_KEYS = [
  "scenario", "portfolio_impact_pct", "rupee_impact", "covered_value", "total_value", "no_data_funds", "benchmarks",
  "phases", "by_fund", "by_member", "hypothetical_assumptions", "assumptions_not_set", "by_asset_class", "funds_data_available",
];
const SUMMARY_KEYS = [
  "scenario_id", "name", "description", "scenario_type", "start_date", "end_date", "is_ongoing", "display_rank",
  "parent_scenario_id", "has_phases", "had_redemption_freeze_schemes", "quick_market_pct", "quick_equity_pct",
  "quick_debt_pct", "quick_weight_quarter",
];
const MEMBER_FUND_KEYS = ["scheme_id", "scheme_name", "rupee_impact", "is_proxied", "proxy_basis", "is_frozen"];
const isMoney = (value: unknown) => value === null || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value));

describe("Planning fixtures", () => {
  it("has the seven files the backend generates, and says they are spec fixtures", () => {
    expect(FIXTURE_NAMES).toEqual([
      "results_family_freeze", "results_family_multi_phase", "results_family_no_fund_data",
      "results_family_no_holdings", "results_family_standard", "results_member_dev", "scenarios_list_curated",
    ]);
    expect(FIXTURE_STATUS).toBe("SPEC FIXTURE");
  });

  it("throws for a name that does not exist, and returns a copy each time", () => {
    expect(() => fixture("nope")).toThrow("unknown Planning fixture: nope");
    const first = fixture<ScenarioResult>("results_family_standard");
    first.rupee_impact = "changed";
    expect(fixture<ScenarioResult>("results_family_standard").rupee_impact).toBe("-655.98");
  });

  it.each(RESULT_NAMES)("%s carries every key of the contract with money as strings", name => {
    const result = fixture<ScenarioResult>(name);
    expect(Object.keys(result).sort()).toEqual([...RESULT_KEYS].sort());
    expect(Object.keys(result.scenario).sort()).toEqual([...SUMMARY_KEYS].sort());
    expect(typeof result.scenario.description).toBe("string");
    for (const value of [result.portfolio_impact_pct, result.rupee_impact, result.covered_value, result.total_value]) {
      expect(isMoney(value)).toBe(true);
    }
    expect(typeof result.funds_data_available).toBe("boolean");
    for (const group of result.by_asset_class) {
      expect([group.rupee_impact, group.covered_value, group.pct].every(isMoney)).toBe(true);
    }
    for (const member of result.by_member) {
      expect(isMoney(member.rupee_impact) && isMoney(member.pct)).toBe(true);
      for (const fund of member.funds) {
        expect(Object.keys(fund).sort()).toEqual([...MEMBER_FUND_KEYS].sort());
        expect(isMoney(fund.rupee_impact)).toBe(true);
      }
    }
  });

  it.each(RESULT_NAMES)("%s lists its asset groups in the fixed order", name => {
    const buckets = fixture<ScenarioResult>(name).by_asset_class.map(group => group.bucket);
    const order = buckets.map(bucket => ASSET_GROUPS.indexOf(bucket as (typeof ASSET_GROUPS)[number]));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("standard: group, member and headline sums agree to the paisa", () => {
    const result = fixture<ScenarioResult>("results_family_standard");
    const members = result.by_member.map(member => member.rupee_impact);
    expect(sumDecimalStrings(members)).toBe(result.rupee_impact);
    for (const member of result.by_member) {
      expect(sumDecimalStrings(member.funds.map(fund => fund.rupee_impact ?? "0"))).toBe(member.rupee_impact);
    }
    expect(sumDecimalStrings(result.by_asset_class.map(group => group.rupee_impact))).toBe(result.rupee_impact);
    expect(sumDecimalStrings(result.by_asset_class.map(group => group.covered_value))).toBe(result.covered_value);
    expect(result.by_member.map(member => member.member_name)).toEqual(["ASHA RAO", "Dev Rao"]);
    expect(result.by_member[1].funds[1]).toMatchObject({ is_proxied: true, proxy_basis: "asset_class_average:Gold" });
  });

  it("member fixture has one member and totals for that member only", () => {
    const result = fixture<ScenarioResult>("results_member_dev");
    expect(result.by_member).toHaveLength(1);
    expect(result.by_member[0].household_member_id).toBe("e6b4557c-b0e3-58f9-8642-54da2db3a27d");
    expect(result.total_value).toBe("3012.00");
  });

  it("freeze: the frozen fund has no rupee impact and is outside the sums", () => {
    const result = fixture<ScenarioResult>("results_family_freeze");
    const frozen = result.by_member.flatMap(member => member.funds).filter(fund => fund.is_frozen);
    expect(frozen).toHaveLength(1);
    expect(frozen[0].rupee_impact).toBeNull();
    expect(result.scenario.had_redemption_freeze_schemes).toEqual(["Dev Short Duration Debt"]);
    expect(result.benchmarks).toEqual([]);
    expect(result.covered_value).toBe("3210.00");
    expect(result.by_asset_class.map(group => group.bucket)).toEqual(["Equity", "Gold and Silver"]);
  });

  it("multi-phase, no-fund-data and no-holdings keep the shapes the page relies on", () => {
    const multi = fixture<ScenarioResult>("results_family_multi_phase");
    expect(multi.scenario.has_phases).toBe(true);
    expect(multi.scenario.parent_scenario_id).toBeNull();
    expect(multi.phases.map(phase => phase.order)).toEqual([1, 2]);
    expect(multi.benchmarks).toEqual([]);
    const none = fixture<ScenarioResult>("results_family_no_fund_data");
    expect(none).toMatchObject({ portfolio_impact_pct: null, funds_data_available: false, no_data_funds: 4, by_asset_class: [] });
    const empty = fixture<ScenarioResult>("results_family_no_holdings");
    expect(empty).toMatchObject({ total_value: "0.00", portfolio_impact_pct: null, funds_data_available: true });
    expect(empty.by_member.every(member => member.funds.length === 0)).toBe(true);
  });

  it("the list has five scenarios, none ongoing, and one without a description", () => {
    const list = fixture<ScenarioSummary[]>("scenarios_list_curated");
    expect(list.map(row => row.scenario_id)).toHaveLength(5);
    expect(list.every(row => row.is_ongoing === false && row.end_date !== null)).toBe(true);
    expect(list.filter(row => row.description === "")).toHaveLength(1);
    expect(list.every(row => Object.keys(row).sort().join() === [...SUMMARY_KEYS].sort().join())).toBe(true);
  });
});
