import { describe, expect, it } from "vitest";
import { sortAllocationItems } from "./allocationSort";

describe("sortAllocationItems", () => {
  const items = [42, 31, 18, 9].map((value, index) => ({ label: "ABCD"[index], percentage: String(value) }));
  it("sorts exact shares in either direction without mutating input", () => {
    expect(sortAllocationItems(items, "asc").map(item => item.label)).toEqual(["D", "C", "B", "A"]);
    expect(sortAllocationItems(items, "desc").map(item => item.label)).toEqual(["A", "B", "C", "D"]);
    expect(items.map(item => item.label)).toEqual(["A", "B", "C", "D"]);
    expect(sortAllocationItems(items, "asc")).not.toBe(items);
  });
  it.each(["asc", "desc"] as const)("breaks ties alphabetically in %s order", order => {
    expect(sortAllocationItems([{ label: "B", percentage: "10.00" }, { label: "A", percentage: "10" }], order).map(item => item.label)).toEqual(["A", "B"]);
  });
  it("handles empty and single-item inputs", () => {
    expect(sortAllocationItems([], "asc")).toEqual([]);
    expect(sortAllocationItems(items.slice(0, 1), "asc")).toEqual([items[0]]);
  });
  it("compares shares beyond floating-point precision", () => {
    expect(sortAllocationItems([{ label: "A", percentage: "10.000000000000000001" }, { label: "B", percentage: "10.000000000000000000" }], "asc").map(item => item.label)).toEqual(["B", "A"]);
  });
});
