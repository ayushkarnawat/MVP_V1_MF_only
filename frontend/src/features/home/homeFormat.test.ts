import { describe, expect, it } from "vitest";
import * as kit from "../../lib/format";
import {
  changeDirection,
  formatAsOf,
  formatCompactRupees,
  formatDate,
  formatDayMonth,
  formatPercent,
  formatRupees,
  formatSignedCompactRupees,
  formatSignedPercent,
  formatSignedRupees,
  greetingLine,
  scoreBand,
} from "./homeFormat";

describe("re-exports of the shared kit helpers", () => {
  it("are the same functions, not copies", () => {
    expect(formatRupees).toBe(kit.formatRupees);
    expect(formatCompactRupees).toBe(kit.formatCompactRupees);
    expect(formatPercent).toBe(kit.formatPercent);
    expect(formatDate).toBe(kit.formatDate);
    expect(scoreBand).toBe(kit.scoreBand);
  });
});

describe("changeDirection", () => {
  it.each([
    ["38400", "up"],
    ["+12.5", "up"],
    ["0.01", "up"],
    ["-38400", "down"],
    ["-0.01", "down"],
    ["0", "flat"],
    ["0.00", "flat"],
    ["-0.00", "flat"],
    ["  ", "flat"],
    ["abc", "flat"],
  ])("%s is %s", (value, expected) => {
    expect(changeDirection(value)).toBe(expected);
  });

  it("treats null and undefined as flat", () => {
    expect(changeDirection(null)).toBe("flat");
    expect(changeDirection(undefined)).toBe("flat");
  });
});

describe("formatSignedRupees", () => {
  it("puts a plus sign on gains and keeps the minus before the rupee sign on losses", () => {
    expect(formatSignedRupees("38400")).toBe("+₹38,400");
    expect(formatSignedRupees("-38400")).toBe("-₹38,400");
    expect(formatSignedRupees("+1250.50")).toBe("+₹1,251");
  });

  it("uses Indian grouping", () => {
    expect(formatSignedRupees("21347320")).toBe("+₹2,13,47,320");
    expect(formatSignedRupees("-100000")).toBe("-₹1,00,000");
  });

  it("shows zero, and an amount that rounds to zero, without a sign", () => {
    expect(formatSignedRupees("0")).toBe("₹0");
    expect(formatSignedRupees("0.00")).toBe("₹0");
    expect(formatSignedRupees("0.4")).toBe("₹0");
    expect(formatSignedRupees("-0.4")).toBe("₹0");
  });

  it("shows a dash for missing or invalid values", () => {
    expect(formatSignedRupees(null)).toBe("—");
    expect(formatSignedRupees(undefined)).toBe("—");
    expect(formatSignedRupees("abc")).toBe("—");
  });
});

describe("formatSignedCompactRupees", () => {
  it("signs the compact form", () => {
    expect(formatSignedCompactRupees("21347320")).toBe("+₹2.13 Cr");
    expect(formatSignedCompactRupees("-250000")).toBe("-₹2.50 L");
    expect(formatSignedCompactRupees("38400")).toBe("+₹38,400");
  });

  it("shows zero without a sign and invalid as a dash", () => {
    expect(formatSignedCompactRupees("0")).toBe("₹0");
    expect(formatSignedCompactRupees(null)).toBe("—");
  });
});

describe("formatSignedPercent", () => {
  it("defaults to two places with a sign", () => {
    expect(formatSignedPercent("0.6")).toBe("+0.60%");
    expect(formatSignedPercent("-0.6")).toBe("-0.60%");
    expect(formatSignedPercent("12.3456")).toBe("+12.35%");
  });

  it("takes the number of places", () => {
    expect(formatSignedPercent("12.3456", 1)).toBe("+12.3%");
    expect(formatSignedPercent("-0.05", 3)).toBe("-0.050%");
  });

  it("shows zero without a sign and invalid as a dash", () => {
    expect(formatSignedPercent("0")).toBe("0.00%");
    expect(formatSignedPercent("-0.001")).toBe("0.00%");
    expect(formatSignedPercent(null)).toBe("—");
    expect(formatSignedPercent("abc")).toBe("—");
  });
});

describe("formatDayMonth and formatAsOf", () => {
  it("shows the day with two digits and the month name", () => {
    expect(formatDayMonth("2026-10-23")).toBe("23 Oct");
    expect(formatDayMonth("2026-01-05")).toBe("05 Jan");
    expect(formatDayMonth("2026-10-23T10:00:00Z")).toBe("23 Oct");
  });

  it("shows a dash for missing or invalid dates", () => {
    expect(formatDayMonth(null)).toBe("—");
    expect(formatDayMonth("")).toBe("—");
    expect(formatDayMonth("not-a-date")).toBe("—");
    expect(formatDayMonth("2026-13-01")).toBe("—");
  });

  it("builds the as-of caption, or nothing when there is no date", () => {
    expect(formatAsOf("2026-10-23")).toBe("as of 23 Oct");
    expect(formatAsOf(null)).toBeNull();
    expect(formatAsOf("bad")).toBeNull();
  });
});

describe("greetingLine", () => {
  it("joins the greeting word and the name", () => {
    expect(greetingLine("morning", "Asha")).toBe("Good morning, Asha");
    expect(greetingLine("afternoon", "Dev")).toBe("Good afternoon, Dev");
    expect(greetingLine("evening", "Asha")).toBe("Good evening, Asha");
  });

  it("drops the comma when there is no name", () => {
    expect(greetingLine("morning", "")).toBe("Good morning");
    expect(greetingLine("evening", "   ")).toBe("Good evening");
  });
});
