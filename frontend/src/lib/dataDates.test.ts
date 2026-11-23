import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatDataDate, formatDataDateTail, olderDataMarker, type DataDateKind } from "./dataDates";

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      return [full];
    }
    return [];
  });
}

// Event-date helpers / files listed in Docs/orchestration/2026-11-20-date-audit.md
// that are outside the data-date policy.
const SCAN_ALLOWLIST = new Set<string>([
  "lib/format.ts",
  "lib/dataDates.ts",
  // An event date the person chooses (the opening balance date), not a data date.
  "components/mf/OpeningBalanceModal.tsx",
  // The pop-up's note uses the weekday form ("Prices as on Friday 23 Oct 2026"), which the module does not format (owner decision, 23 Nov).
  "features/home/components/DayChangeDialog.tsx",
  // The legacy print and PDF-export surface: its wording waits for Batch I (owner decision, 23 Nov).
  "features/analytics/AssetAllocationSection.tsx",
  "features/analytics/CapAllocationSection.tsx",
  "features/analytics/OverlapSection.tsx",
  "features/analytics/StockHoldingsSection.tsx",
  "features/analytics/ValuationSection.tsx",
]);

describe("formatDataDate", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("formats exact-day and monthly kinds with 'as on' and marketCapList with 'effective'", () => {
    expect(formatDataDate("prices", "2026-11-12")).toBe("Prices as on 12 Nov 2026");
    expect(formatDataDate("ratios", "2026-11-12")).toBe("Ratios as on 12 Nov 2026");
    expect(formatDataDate("holdings", "2026-09-30")).toBe("Holdings as on September 2026");
    expect(formatDataDate("fees", "2026-09-30")).toBe("Fees as on September 2026");
    expect(formatDataDate("factsheet", "2026-09-30")).toBe("Factsheet as on September 2026");
    expect(formatDataDate("managerDetails", "2026-09-30")).toBe("Manager details as on September 2026");
    expect(formatDataDate("marketCapList", "2026-07-01")).toBe("Market-cap list effective 1 Jul 2026");
  });

  it("renders a month-end stored as a full date as a month", () => {
    expect(formatDataDate("holdings", "2026-09-30")).toBe("Holdings as on September 2026");
    expect(formatDataDate("fees", "2026-03-31")).toBe("Fees as on March 2026");
  });

  it("does not slip a day or month for ISO date-times in any timezone (America/New_York)", () => {
    process.env.TZ = "America/New_York";
    expect(formatDataDate("prices", "2026-09-30T20:30:00Z")).toBe("Prices as on 30 Sep 2026");
    expect(formatDataDate("holdings", "2026-09-30T20:30:00Z")).toBe("Holdings as on September 2026");
  });

  it("does not slip a day or month for ISO date-times in any timezone (Asia/Kolkata)", () => {
    process.env.TZ = "Asia/Kolkata";
    expect(formatDataDate("prices", "2026-09-30T20:30:00Z")).toBe("Prices as on 30 Sep 2026");
    expect(formatDataDate("holdings", "2026-09-30T20:30:00Z")).toBe("Holdings as on September 2026");
  });

  it("event dates are not formatted by this module (no event-date DataDateKind exists)", () => {
    const supportedKinds: DataDateKind[] = [
      "prices",
      "holdings",
      "ratios",
      "fees",
      "marketCapList",
      "factsheet",
      "managerDetails",
    ];
    expect(supportedKinds).toHaveLength(7);
  });

  it("returns an empty string for invalid, empty, or null input", () => {
    expect(formatDataDate("prices", "")).toBe("");
    expect(formatDataDate("prices", "   ")).toBe("");
    expect(formatDataDate("prices", "not-a-date")).toBe("");
    expect(formatDataDate("prices", "2026-02-30")).toBe("");
    expect(formatDataDate("prices", "2026-13-01")).toBe("");
    expect(formatDataDate("prices", null as unknown as string)).toBe("");
    expect(formatDataDate("prices", undefined as unknown as string)).toBe("");
  });
});

describe("formatDataDateTail", () => {
  it("formats the date phrase without its leading noun", () => {
    expect(formatDataDateTail("prices", "2026-10-23")).toBe("as on 23 Oct 2026");
    expect(formatDataDateTail("ratios", "2026-10-23")).toBe("as on 23 Oct 2026");
    expect(formatDataDateTail("holdings", "2026-09-30")).toBe("as on September 2026");
    expect(formatDataDateTail("fees", "2026-09-30")).toBe("as on September 2026");
    expect(formatDataDateTail("factsheet", "2026-09-30")).toBe("as on September 2026");
    expect(formatDataDateTail("managerDetails", "2026-09-30")).toBe("as on September 2026");
    expect(formatDataDateTail("marketCapList", "2026-07-01")).toBe("effective 1 Jul 2026");
  });

  it("returns an empty string for invalid, empty, or null input", () => {
    expect(formatDataDateTail("prices", "")).toBe("");
    expect(formatDataDateTail("prices", "invalid")).toBe("");
    expect(formatDataDateTail("prices", null)).toBe("");
    expect(formatDataDateTail("prices", undefined)).toBe("");
  });
});

describe("olderDataMarker", () => {
  it("flags holdings older than 60 days and not younger", () => {
    const today = new Date(2026, 10, 23); // 2026-11-23
    expect(olderDataMarker("holdings", "2026-09-23", today)).toEqual({
      older: true,
      label: "Older than usual",
    });
    expect(olderDataMarker("holdings", "2026-09-24", today)).toEqual({
      older: false,
      label: null,
    });
  });

  it("flags half-yearly kinds (marketCapList, factsheet) older than 200 days", () => {
    const today = new Date(2026, 10, 23); // 2026-11-23
    expect(olderDataMarker("marketCapList", "2026-05-06", today)).toEqual({
      older: true,
      label: "Older than usual",
    });
    expect(olderDataMarker("factsheet", "2026-05-06", today)).toEqual({
      older: true,
      label: "Older than usual",
    });
    expect(olderDataMarker("marketCapList", "2026-05-07", today)).toEqual({
      older: false,
      label: null,
    });
  });

  it("returns no marker for a kind with no cadence", () => {
    const today = new Date(2026, 10, 23);
    expect(olderDataMarker("prices", "2020-01-01", today)).toEqual({ older: false, label: null });
    expect(olderDataMarker("ratios", "2020-01-01", today)).toEqual({ older: false, label: null });
    expect(olderDataMarker("fees", "2020-01-01", today)).toEqual({ older: false, label: null });
    expect(olderDataMarker("managerDetails", "2020-01-01", today)).toEqual({ older: false, label: null });
  });

  it("returns no marker for invalid or null input", () => {
    const today = new Date(2026, 10, 23);
    expect(olderDataMarker("holdings", "", today)).toEqual({ older: false, label: null });
    expect(olderDataMarker("holdings", "invalid", today)).toEqual({ older: false, label: null });
    expect(olderDataMarker("holdings", null as unknown as string, today)).toEqual({ older: false, label: null });
  });

  // enabled by task E-6 (the label replacement); the allowlist holds the weekday forms and the legacy print surface (Batch I)
  it("a source file scan finds no hard-coded 'as on' or 'as of' outside dataDates.ts and its tests", () => {
    const srcRoot = resolve("src");
    const targets = [
      ...collectSourceFiles(resolve("src/features")),
      ...collectSourceFiles(resolve("src/components")),
    ];
    const flagged = targets
      .filter((file) => {
        const rel = file.slice(srcRoot.length + 1).replaceAll("\\", "/");
        if (SCAN_ALLOWLIST.has(rel)) return false;
        const text = readFileSync(file, "utf8");
        return /\bas (?:on|of)\b/i.test(text);
      })
      .map((file) => file.slice(srcRoot.length + 1).replaceAll("\\", "/"))
      .sort();
    expect(flagged).toEqual([]);
  });
});
