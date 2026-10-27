import { describe, expect, it } from "vitest";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  memberColor,
  memberInitials,
  memberTitleName,
  partialChipText,
  shareOf,
  todayGainLine,
} from "./portfolioFormat";

describe("changeDirection", () => {
  it.each([
    ["12.00", "up"],
    ["+0.01", "up"],
    ["-0.01", "down"],
    ["0.00", "flat"],
    ["-0.00", "flat"],
    ["0", "flat"],
    ["", "flat"],
    ["abc", "flat"],
    [null, "flat"],
    [undefined, "flat"],
  ] as const)("%j gives %s", (value, expected) => {
    expect(changeDirection(value)).toBe(expected);
  });
});

describe("formatSignedRupees", () => {
  it.each([
    ["12.00", "+₹12"],
    ["-12.40", "-₹12"],
    ["1234567.50", "+₹12,34,568"],
    ["0.00", "₹0"],
    ["-0.00", "₹0"],
    ["-0.40", "₹0"],
    [null, "—"],
    ["abc", "—"],
  ] as const)("%j gives %s", (value, expected) => {
    expect(formatSignedRupees(value)).toBe(expected);
  });
});

describe("formatSignedPercent", () => {
  it.each([
    ["0.2308", undefined, "+0.23%"],
    ["4.2400", 1, "+4.2%"],
    ["-0.2900", undefined, "-0.29%"],
    ["-0.0004", undefined, "0.00%"],
    ["0.0000", 1, "0.0%"],
    [null, undefined, "—"],
  ] as const)("%j with %j digits gives %s", (value, digits, expected) => {
    expect(formatSignedPercent(value, digits)).toBe(expected);
  });
});

describe("formatXirr", () => {
  it.each([
    ["0.3488967977667153354496159637", "34.9%"],
    ["-0.716009594645563925", "-71.6%"],
    ["0.02500388494063320481590854151", "2.5%"],
    ["1.9397", "194.0%"],
    ["0", "0.0%"],
    ["-0.00001", "0.0%"],
    [null, "—"],
  ] as const)("%j gives %s (a decimal fraction shifted two places, never a float)", (value, expected) => {
    expect(formatXirr(value)).toBe(expected);
  });
});

describe("todayGainLine", () => {
  it.each([
    ["12.00", "0.2308", "Today's Gain: +₹12 (0.23%)"],
    ["-41230.40", "-0.2900", "Today's Gain: -₹41,230 (-0.29%)"],
    ["0.00", "0.0000", "Today's Gain: ₹0 (0.00%)"],
    ["-0.00", "-0.0004", "Today's Gain: ₹0 (0.00%)"],
    ["12.00", null, "Today's Gain: +₹12"],
  ] as const)("%j and %j give %s", (gain, pct, expected) => {
    expect(todayGainLine(gain, pct)).toBe(expected);
  });
});

describe("partialChipText", () => {
  it("is empty without missing funds and counts them otherwise", () => {
    expect(partialChipText([])).toBe("");
    expect(partialChipText([{ scheme_id: "a", name: "A" }])).toBe("1 on last known NAV");
    expect(partialChipText([
      { scheme_id: "a", name: "A" }, { scheme_id: "b", name: "B" }, { scheme_id: "c", name: "C" },
    ])).toBe("3 on last known NAV");
  });
});

describe("shareOf", () => {
  it.each([
    ["2000.00", "8000.00", "25.0000"],
    ["1.00", "3.00", "33.3333"],
    ["2.00", "3.00", "66.6667"],
    ["0.00", "10.00", "0.0000"],
    ["10.00", "10.00", "100.0000"],
    ["5.00", "0.00", null],
    ["5.00", "-1.00", null],
  ] as const)("%j of %j gives %j (exact, four places, half up)", (value, total, expected) => {
    expect(shareOf(value, total)).toBe(expected);
  });
});

describe("member helpers", () => {
  it("title-cases an all-capitals name and leaves a mixed-case one alone", () => {
    expect(memberTitleName("ASHA RAO")).toBe("Asha Rao");
    expect(memberTitleName("ASHARAO")).toBe("Asharao");
    expect(memberTitleName("Dev Rao")).toBe("Dev Rao");
    expect(memberTitleName("McDonald")).toBe("McDonald");
    expect(memberTitleName("")).toBe("");
  });

  it("takes the first letters of up to two words, upper-cased", () => {
    expect(memberInitials("Asha Rao")).toBe("AR");
    expect(memberInitials("ASHARAO")).toBe("A");
    expect(memberInitials("dev")).toBe("D");
    expect(memberInitials("Dev  Kumar Rao")).toBe("DK");
    expect(memberInitials("  ")).toBe("?");
  });

  it("cycles eight colours", () => {
    expect(memberColor(0)).toBe("var(--c1)");
    expect(memberColor(7)).toBe("var(--c8)");
    expect(memberColor(8)).toBe("var(--c1)");
    expect(memberColor(9)).toBe("var(--c2)");
  });
});
