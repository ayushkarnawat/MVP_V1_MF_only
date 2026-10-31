import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import type { AllocationResponse, ClassRowOut } from "./types";
import {
  compareDecimalStrings,
  formatLegendPercent,
  liveRows,
  memberColor,
  memberInitial,
  memberTitleName,
  soonRows,
} from "./allocationCopy";

describe("compareDecimalStrings", () => {
  it.each([
    ["2", "10", -1],
    ["10", "2", 1],
    ["2200.00", "2200", 0],
    ["0.00", "0", 0],
    ["19.38", "19.4", -1],
    ["100.5", "100.45", 1],
    ["-5", "3", -1],
    ["-5", "-10", 1],
    ["-0.00", "0", 0],
    ["+7", "7", 0],
    ["123456789012345678.01", "123456789012345678.1", -1],
  ])("%s versus %s is %i", (a, b, expected) => {
    expect(compareDecimalStrings(a, b)).toBe(expected);
  });
});

describe("liveRows", () => {
  it("keeps only live classes, largest value first, and colours them by rank from the chart palette", () => {
    const rows = liveRows(fixture<AllocationResponse>("allocation_family").classes);
    expect(rows.map(row => row.key)).toEqual(["equity", "debt", "gold", "real_estate", "others"]);
    expect(rows.map(row => row.color)).toEqual(["var(--c1)", "var(--c2)", "var(--c3)", "var(--ui-divider)", "var(--ui-divider)"]);
    expect(rows[0]).toMatchObject({ label: "Equity", value: "2200.00", percentage: "42.21" });
  });

  it("re-orders when the values change (colours follow rank, not the class)", () => {
    const rows = liveRows(fixture<AllocationResponse>("allocation_member").classes);
    expect(rows.map(row => row.key)).toEqual(["debt", "gold", "equity", "real_estate", "others"]);
    expect(rows.map(row => row.color)).toEqual(["var(--c1)", "var(--c2)", "var(--ui-divider)", "var(--ui-divider)", "var(--ui-divider)"]);
  });

  it("puts zero-valued classes last in their original order and gives them the muted colour", () => {
    const rows = liveRows(fixture<AllocationResponse>("allocation_empty").classes);
    expect(rows.map(row => row.key)).toEqual(["equity", "debt", "gold", "real_estate", "others"]);
    expect(rows.every(row => row.color === "var(--ui-divider)")).toBe(true);
  });

  it("is stable for equal values and never goes past the eighth palette colour", () => {
    const many: ClassRowOut[] = Array.from({ length: 10 }, (_, index) => ({
      key: `k${index}`, label: `K${index}`, status: "live", value: "100.00", percentage: "10.00",
    }));
    const rows = liveRows(many);
    expect(rows.map(row => row.key)).toEqual(many.map(row => row.key));
    expect(rows[7].color).toBe("var(--c8)");
    expect(rows[9].color).toBe("var(--c8)");
  });

  it("treats a missing value like zero", () => {
    const rows = liveRows([{ key: "a", label: "A", status: "live", value: null, percentage: null }]);
    expect(rows[0]).toMatchObject({ value: "0", percentage: "0", color: "var(--ui-divider)" });
  });
});

describe("soonRows", () => {
  it("keeps the coming-soon classes in the given order", () => {
    expect(soonRows(fixture<AllocationResponse>("allocation_family").classes).map(row => row.label)).toEqual([
      "Direct stocks", "FDs and bonds", "US stocks",
    ]);
  });
});

describe("formatLegendPercent", () => {
  it("shows one decimal place", () => {
    expect(formatLegendPercent("42.21")).toBe("42.2%");
    expect(formatLegendPercent("19.38")).toBe("19.4%");
    expect(formatLegendPercent("0.00")).toBe("0.0%");
    expect(formatLegendPercent("100")).toBe("100.0%");
  });

  it("shows a dash for a missing value", () => {
    expect(formatLegendPercent(null)).toBe("—");
  });
});

describe("member helpers", () => {
  it("colours members by position, wrapping after eight", () => {
    expect(memberColor(0)).toBe("var(--c1)");
    expect(memberColor(7)).toBe("var(--c8)");
    expect(memberColor(8)).toBe("var(--c1)");
  });

  it("uses the first letter, upper case, as the avatar", () => {
    expect(memberInitial("ASHA RAO")).toBe("A");
    expect(memberInitial("dev")).toBe("D");
    expect(memberInitial("  priya")).toBe("P");
    expect(memberInitial("")).toBe("?");
  });

  it("writes an all-capitals name in title case and leaves a normal name alone", () => {
    expect(memberTitleName("ASHA RAO")).toBe("Asha Rao");
    expect(memberTitleName("Dev Rao")).toBe("Dev Rao");
    expect(memberTitleName("ROHAN VIJAY KULKARNI")).toBe("Rohan Vijay Kulkarni");
    expect(memberTitleName("McDonald")).toBe("McDonald");
    expect(memberTitleName("")).toBe("");
  });
});
