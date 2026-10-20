import { describe, expect, it } from "vitest";
import { formatDateRange, formatExactDate, formatMonthYear } from "./dateRange";

describe("formatDateRange", () => {
  it.each([
    ["2020-01-20", "2020-03-31", false, "20 January 2020 – 31 March 2020"],
    ["2026-02-28", null, true, "28 February 2026 – ongoing"],
    ["2024-02-29", "2024-02-29", false, "29 February 2024"],
    ["2020-03", null, false, "March 2020"],
    ["2020-13-40", "2020-06-30", false, "30 June 2020"],
    [null, null, false, null],
    ["2023-02-29", null, false, "February 2023"],
    ["2020-03-31", "2020-04-01", false, "31 March 2020 – 1 April 2020"],
    [undefined, "2020-04-01", false, "1 April 2020"],
    [undefined, undefined, true, null],
  ])("formats %s to %s (ongoing %s)", (start, end, ongoing, expected) => {
    expect(formatDateRange(start, end, ongoing)).toBe(expected);
  });
});

describe("calendar validation", () => {
  it.each(["2023-02-29", "1900-02-29", "2020-04-31", "2020-00-01", "2020-13-01", "2020-01-00", "2020-03", "bad", null, undefined])("rejects invalid exact date %s", value => {
    expect(formatExactDate(value)).toBeNull();
  });
  it("honours century leap years and month-only fallbacks", () => {
    expect(formatExactDate("2000-02-29")).toBe("29 February 2000");
    expect(formatMonthYear("2023-02-29")).toBe("February 2023");
    expect(formatMonthYear("2020-03")).toBe("March 2020");
    expect(formatMonthYear("2020-13-40")).toBeNull();
    expect(formatMonthYear("bad")).toBeNull();
  });
});
