import { describe, expect, it } from "vitest";
import { filterFundRows } from "./otherSearch";

const rows = [
  { scheme_name: "Example Nifty 500 Index Fund", category_name: "Index Funds" },
  { scheme_name: "Example Nifty 50 Index Fund", category_name: "Index Funds" },
  { scheme_name: "Example Growth Fund", category_name: "Flexi Cap" },
];

describe("Other Analytics search keeps numbers", () => {
  it("500 finds the Nifty 500 fund only", () => {
    expect(filterFundRows(rows, "500").map(row => row.scheme_name)).toEqual(["Example Nifty 500 Index Fund"]);
  });
  it("a number and a category word narrow together", () => {
    expect(filterFundRows(rows, "index 50").map(row => row.scheme_name)).toEqual(["Example Nifty 500 Index Fund", "Example Nifty 50 Index Fund"]);
  });
});
