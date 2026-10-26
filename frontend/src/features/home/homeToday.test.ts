import { describe, expect, it } from "vitest";
import { istToday } from "./homeToday";

describe("istToday", () => {
  it("gives the Indian calendar date, which is 5 hours 30 minutes ahead of UTC", () => {
    expect(istToday(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24");
    expect(istToday(new Date("2026-10-23T18:29:59Z"))).toBe("2026-10-23");
    expect(istToday(new Date("2026-10-23T18:30:00Z"))).toBe("2026-10-24");
  });

  it("rolls over a month and a year", () => {
    expect(istToday(new Date("2026-10-31T19:00:00Z"))).toBe("2026-11-01");
    expect(istToday(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(istToday(new Date("2028-02-28T19:00:00Z"))).toBe("2028-02-29");
    expect(istToday(new Date("2028-02-29T19:00:00Z"))).toBe("2028-03-01");
  });

  it("defaults to the current time", () => {
    expect(istToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
