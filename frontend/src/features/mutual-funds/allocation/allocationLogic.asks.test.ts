import { describe, expect, it } from "vitest";
import * as fa from "../fixtures/mfAsks";
import * as fb from "../fixtures/mfB";
import { classFunds } from "./allocationLogic";

describe("classFunds", () => {
  it("returns a class's funds exactly as the backend ordered them, from the variant it is given", () => {
    const data = fa.assetAllocationWithFunds();
    expect(classFunds(data.as_disclosed, "equity")?.map(fund => fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-HDARB", "S-SBI"]);
    expect(classFunds(data.arbitrage_as_cash, "equity")?.map(fund => fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI"]);
    expect(classFunds(data.as_disclosed, "debt")?.map(fund => [fund.scheme_id, fund.value])).toEqual([["S-HDOV", "552500.00"], ["S-SBI", "119000.00"], ["S-KOTAK", "51000.00"]]);
    expect(classFunds(data.arbitrage_as_cash, "debt")?.map(fund => fund.scheme_id)).toEqual(["S-HDOV", "S-HDARB", "S-SBI", "S-KOTAK"]);
    expect(classFunds(data.as_disclosed, "gold")).toEqual([{ scheme_id: "S-AXINT", scheme_name: "Axis International Fund of Fund", value: "212500.00", percentage: "100" }]);
  });
  it("does not re-sort or filter what it was given", () => {
    const data = fa.assetAllocationWithFunds();
    const equity = data.as_disclosed.classes[0];
    equity.funds = [equity.funds![4], equity.funds![0]];
    expect(classFunds(data.as_disclosed, "equity")?.map(fund => fund.scheme_id)).toEqual(["S-SBI", "S-KOTAK"]);
  });
  it("returns null when the payload has no funds for the class (old payload, undefined or null), and [] for an empty list", () => {
    const old = fb.assetAllocation();
    expect(classFunds(old.as_disclosed, "equity")).toBeNull();
    const data = fa.assetAllocationWithFunds();
    data.as_disclosed.classes[1].funds = null;
    expect(classFunds(data.as_disclosed, "debt")).toBeNull();
    data.as_disclosed.classes[2].funds = [];
    expect(classFunds(data.as_disclosed, "gold")).toEqual([]);
  });
  it("returns null for a class the variant does not contain", () => {
    const data = fa.assetAllocationWithFunds();
    data.as_disclosed.classes = data.as_disclosed.classes.filter(item => item.key !== "gold");
    expect(classFunds(data.as_disclosed, "gold")).toBeNull();
  });
});
