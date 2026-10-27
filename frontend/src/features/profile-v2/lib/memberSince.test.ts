import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberSince } from "./memberSince";

// "Member since" shows `Mon YYYY` in Indian Standard Time (UTC+05:30), whatever the machine's own time zone is.
// Month names are written out (en-GB's Intl short form for September is "Sept", which is not what the page shows).
describe("memberSince", () => {
  it.each([
    ["2025-10-14T09:30:00+05:30", "Oct 2025"],
    ["2025-10-14T04:00:00Z", "Oct 2025"],
    ["2025-09-10T00:00:00Z", "Sep 2025"],
    ["2025-03-05", "Mar 2025"],
    ["2026-01-02T10:00:00.123456+00:00", "Jan 2026"],
  ])("%s gives %s", (iso, expected) => {
    expect(memberSince(iso)).toBe(expected);
  });

  it.each([
    ["2025-10-31T18:29:59Z", "Oct 2025"],
    ["2025-10-31T18:30:00Z", "Nov 2025"],
    ["2025-12-31T18:30:00Z", "Jan 2026"],
    ["2025-10-31T20:00:00+00:00", "Nov 2025"],
  ])("uses the Indian calendar month at the boundary: %s gives %s", (iso, expected) => {
    expect(memberSince(iso)).toBe(expected);
  });

  it("reads a time with no zone as UTC, not as the machine's local time", () => {
    expect(memberSince("2025-10-31T20:00:00")).toBe("Nov 2025");
    expect(memberSince("2025-10-31T18:00:00")).toBe("Oct 2025");
  });

  it.each([[null], [undefined], [""], ["   "], ["not a date"], ["2025-13-45"]])("gives null for %j", value => {
    expect(memberSince(value as string | null | undefined)).toBeNull();
  });
});

// The same answers on a machine in another time zone (a developer laptop in the US, say): Node honours a TZ change inside this test process.
describe("memberSince does not depend on the machine's own time zone", () => {
  const before = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/Los_Angeles"; });
  afterAll(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; });

  it("really runs in another zone (otherwise the cases below prove nothing)", () => {
    expect(new Date("2025-01-15T12:00:00Z").getTimezoneOffset()).toBe(480);
  });

  it.each([
    ["2025-10-31T18:30:00Z", "Nov 2025"],
    ["2025-10-31T18:29:59Z", "Oct 2025"],
    ["2025-10-31T20:00:00", "Nov 2025"],
    ["2025-10-31T18:00:00", "Oct 2025"],
    ["2025-12-31T18:30:00Z", "Jan 2026"],
    ["2025-03-05", "Mar 2025"],
    ["2025-09-10T00:00:00Z", "Sep 2025"],
  ])("%s gives %s", (iso, expected) => {
    expect(memberSince(iso)).toBe(expected);
  });
});
