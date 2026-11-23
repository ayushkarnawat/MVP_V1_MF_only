import { describe, expect, it } from "vitest";
import type { SipRow } from "../types";
import { filterHoldingRows, filterSipRows } from "./overviewSearch";

const rows = [
  { scheme_name: "Example Nifty 500 Index Fund", amc_name: "Orchid AMC" },
  { scheme_name: "Example Nifty 50 Index Fund", amc_name: "Orchid AMC" },
  { scheme_name: "Example Growth Fund", amc_name: "Maple AMC" },
];

describe("Overview search keeps numbers in fund names", () => {
  it("500 finds the Nifty 500 fund and not the Nifty 50 fund or the others", () => {
    expect(filterHoldingRows(rows, "500", []).map(row => row.scheme_name)).toEqual(["Example Nifty 500 Index Fund"]);
  });
  it("nifty 500 narrows to the one fund, not to every Nifty fund", () => {
    expect(filterHoldingRows(rows, "nifty 500", []).map(row => row.scheme_name)).toEqual(["Example Nifty 500 Index Fund"]);
  });
  it("a year-like number in a name is a word too", () => {
    const withYear = [{ scheme_name: "Example Target 2030 Fund" }, { scheme_name: "Example Growth Fund" }];
    expect(filterHoldingRows(withYear, "2030", []).map(row => row.scheme_name)).toEqual(["Example Target 2030 Fund"]);
  });
  it("SIP rows keep numbers too", () => {
    const sips = [
      { scheme_id: "a", scheme_name: "Example Nifty 500 Index Fund", household_member_id: "m", household_member_name: "Asha", sip_date: "2026-11-05", sip_amount: "1000", next_due_date: "2026-12-05" },
      { scheme_id: "b", scheme_name: "Example Growth Fund", household_member_id: "m", household_member_name: "Asha", sip_date: "2026-11-05", sip_amount: "1000", next_due_date: "2026-12-05" },
    ] as SipRow[];
    expect(filterSipRows(sips, "500", []).map(row => row.scheme_id)).toEqual(["a"]);
  });
});
