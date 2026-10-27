import { describe, expect, it } from "vitest";
import type { InvestmentWithdrawalEntry } from "@/features/analytics/types";
import { breakdownTotals, groupByFund, transactionLabel } from "./periodBreakdown";

function entry(direction: InvestmentWithdrawalEntry["direction"], amount: string, schemeName = "Alpha", member = "m1"): InvestmentWithdrawalEntry {
  return {
    transaction_id: `${schemeName}-${member}-${direction}-${amount}`, date: "2024-03-31", type: "purchase",
    direction, amount, scheme_name: schemeName, household_member_id: member,
    household_member_name: member === "m1" ? "Priya" : "Rohan",
  };
}

describe("groupByFund", () => {
  it("merges the same fund across members, nets reversals and separates opening holdings", () => {
    const entries = [entry("opening", "500000.00"), entry("invested", "100.10"), entry("invested", "200.20", "Alpha", "m2"),
      entry("reversal", "50.05"), entry("withdrawn", "10.10"), entry("switched_in", "20.20"), entry("switched_out", "5.05")];
    const before = JSON.stringify(entries);
    const { rows, opening } = groupByFund(entries, null);
    expect(opening).toBe("500000.00");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ schemeName: "Alpha", memberNames: ["Priya", "Rohan"], invested: "250.25", withdrawn: "10.10",
      switchedIn: "20.20", switchedOut: "5.05", net: "255.30" });
    expect(rows[0].entries).toEqual(entries.slice(1));
    expect(JSON.stringify(entries)).toBe(before);
    expect(groupByFund(entries, "m2")).toMatchObject({ opening: "0", rows: [{ invested: "200.20", memberNames: ["Rohan"] }] });
    expect(groupByFund(entries, "absent")).toEqual({ rows: [], opening: "0" });
  });

  it("sorts by largest movement with name ties and exact large decimal comparisons", () => {
    const { rows } = groupByFund([entry("invested", "10.00", "Beta"), entry("withdrawn", "10.00", "Alpha"),
      entry("switched_out", "9007199254740993.01", "Zulu"), entry("switched_in", "9007199254740993.02", "Gamma")], null);
    expect(rows.map(row => row.schemeName)).toEqual(["Gamma", "Zulu", "Alpha", "Beta"]);
  });

  it("preserves negative investment when a reversal posts without a purchase in the period", () => {
    const { rows } = groupByFund([entry("reversal", "5000.00")], null);
    expect(rows[0].invested).toBe("-5000.00");
    expect(rows[0].net).toBe("-5000.00");
  });
});

describe("breakdownTotals", () => {
  it("sums every row and reconciles bucket invested and withdrawn while excluding opening", () => {
    const { rows } = groupByFund([entry("opening", "500000.00"), entry("invested", "100.10"), entry("reversal", "20.05"),
      entry("invested", "50.25", "Beta"), entry("withdrawn", "10.00"), entry("withdrawn", "20.25", "Beta"),
      entry("switched_in", "30.30"), entry("switched_out", "40.40", "Beta")], null);
    expect(breakdownTotals(rows)).toEqual({ invested: "130.30", withdrawn: "30.25", switchedIn: "30.30", switchedOut: "40.40", net: "89.95" });
  });

  it("handles an empty period and an opening-only account", () => {
    const result = groupByFund([entry("opening", "100.00")], null);
    expect(result).toEqual({ rows: [], opening: "100.00" });
    expect(breakdownTotals(result.rows)).toEqual({ invested: "0", withdrawn: "0", switchedIn: "0", switchedOut: "0", net: "0" });
  });
});

it.each([
  ["purchase_sip", "SIP"], ["purchase", "Lump sum"], ["redemption", "Redemption"], ["dividend_payout", "Dividend payout"],
  ["switch_in", "Switch in"], ["switch_out", "Switch out"], ["reversal", "Bounced SIP (reversed)"],
  ["opening_balance", "Opening holdings"], ["BONUS", "Bonus"], ["constructor", "Constructor"], ["__proto__", "__proto__"],
])("labels %s as %s", (type, label) => {
  expect(transactionLabel({ ...entry("invested", "0"), type })).toBe(label);
});
