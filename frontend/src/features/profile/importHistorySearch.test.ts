import { describe, expect, it } from "vitest";
import type { HouseholdImportHistoryItem } from "../import/types";
import { filterImportGroups } from "./importHistorySearch";

const asha: HouseholdImportHistoryItem = {
  import_id: "asha-import", household_member_id: "asha", member_name: "Asha",
  uploaded_at: "2026-11-03T10:30:00Z", statement_from_date: "2026-09-12",
  statement_to_date: "2026-10-20", status: "import_successful", new_transactions_count: 5,
  upload_group_id: "family-upload", group_people_count: 2,
};
const groups: HouseholdImportHistoryItem[][] = [
  [asha, { ...asha, import_id: "bela-import", household_member_id: "bela", member_name: "Bela", status: "needs_review" }],
  [{ ...asha, import_id: "chitra-import", household_member_id: "chitra", member_name: "Chitra",
    uploaded_at: "2026-12-10T10:30:00Z", statement_from_date: "2025-04-01", statement_to_date: "2026-03-31",
    upload_group_id: null, group_people_count: 1 }],
];

describe("filterImportGroups", () => {
  it("empty text returns the groups unchanged", () => {
    expect(filterImportGroups(groups, "")).toBe(groups);
  });

  it("matches a member name", () => {
    const result = filterImportGroups(groups, "bela");
    expect(result).toEqual([groups[0]]);
    expect(result[0]).toBe(groups[0]);
    expect(filterImportGroups(groups, "chitra")).toEqual([groups[1]]);
  });

  it("matches the statement dates in all three forms", () => {
    for (const text of ["2026-09-12", "12 Sep 2026", "September 2026",
      "2026-10-20", "20 Oct 2026", "October 2026"]) {
      expect(filterImportGroups(groups, text), text).toEqual([groups[0]]);
    }
  });

  it("matches the import month", () => {
    for (const text of ["2026-11-03", "3 Nov 2026", "November 2026"]) {
      expect(filterImportGroups(groups, text), text).toEqual([groups[0]]);
    }
  });

  it("matches the status with spaces", () => {
    expect(filterImportGroups(groups, "needs review")).toEqual([groups[0]]);
  });

  it("every word must match, across the rows of one group", () => {
    expect(filterImportGroups(groups, "review asha september")).toEqual([groups[0]]);
    expect(filterImportGroups(groups, "september asha review")).toEqual([groups[0]]);
    expect(filterImportGroups(groups, "chitra review")).toEqual([]);
  });

  it("a group with two people is kept when either matches a name word and all other words match somewhere in the group", () => {
    expect(filterImportGroups(groups, "asha needs review")).toEqual([groups[0]]);
    expect(filterImportGroups(groups, "bela successful november")).toEqual([groups[0]]);
    expect(filterImportGroups(groups, "asha chitra")).toEqual([]);
  });

  it("no match gives an empty list", () => {
    expect(filterImportGroups(groups, "unrelated")).toEqual([]);
  });
});
