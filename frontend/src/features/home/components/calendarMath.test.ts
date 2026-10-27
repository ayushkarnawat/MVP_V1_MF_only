import { describe, expect, it } from "vitest";
import { daysInMonth, isoDate, leadingBlanks, minSelectableDate, monthTitle, shiftMonth } from "./calendarMath";

describe("daysInMonth", () => {
  it.each([
    [2026, 1, 31], [2026, 2, 28], [2028, 2, 29], [2100, 2, 28], [2000, 2, 29],
    [2026, 4, 30], [2026, 10, 31], [2026, 12, 31],
  ])("%i-%i has %i days", (year, month, days) => {
    expect(daysInMonth(year, month)).toBe(days);
  });
});

describe("minSelectableDate", () => {
  it("is ten years before today by default", () => {
    expect(minSelectableDate("2026-10-23")).toBe("2016-10-23");
  });

  it("clamps the day when the month is shorter ten years earlier (29 February)", () => {
    expect(minSelectableDate("2028-02-29")).toBe("2018-02-28");
  });

  it("keeps a leap day when the earlier year is also a leap year", () => {
    expect(minSelectableDate("2032-02-29", 4)).toBe("2028-02-29");
  });

  it("takes the number of years", () => {
    expect(minSelectableDate("2026-10-23", 1)).toBe("2025-10-23");
  });
});

describe("shiftMonth", () => {
  it("moves within a year and across year boundaries", () => {
    expect(shiftMonth(2026, 10, 1)).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 3, -14)).toEqual({ year: 2025, month: 1 });
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 });
  });
});

describe("leadingBlanks (Monday first)", () => {
  it.each([
    [2026, 10, 3], // 1 Oct 2026 is a Thursday
    [2026, 6, 0], // 1 Jun 2026 is a Monday
    [2026, 2, 6], // 1 Feb 2026 is a Sunday
    [2028, 2, 1], // 1 Feb 2028 is a Tuesday
  ])("%i-%i has %i blanks before the 1st", (year, month, blanks) => {
    expect(leadingBlanks(year, month)).toBe(blanks);
  });
});

describe("monthTitle and isoDate", () => {
  it("writes the month name and year", () => {
    expect(monthTitle(2026, 10)).toBe("October 2026");
    expect(monthTitle(2028, 2)).toBe("February 2028");
  });

  it("zero-pads month and day", () => {
    expect(isoDate(2026, 3, 5)).toBe("2026-03-05");
    expect(isoDate(2026, 12, 31)).toBe("2026-12-31");
  });
});
