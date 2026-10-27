import { describe, expect, it } from "vitest";
import { HISTORY_FIXTURE, HISTORY_STATEMENT_COUNTS } from "../fixtures/importHistory";
import { statementCount } from "./statementCount";

describe("statementCount", () => {
  it.each(Object.entries(HISTORY_STATEMENT_COUNTS))("counts the spec fixture's statements for %s as %i", (memberId, expected) => {
    expect(statementCount(memberId, HISTORY_FIXTURE)).toBe(expected);
  });

  it("is 0 for no history and for a member who is not in it", () => {
    expect(statementCount("m-self", [])).toBe(0);
    expect(statementCount("someone-else", HISTORY_FIXTURE)).toBe(0);
  });

  it("counts the rows of one upload group once", () => {
    const rows = [
      { import_id: "a", household_member_id: "m", upload_group_id: "g", },
      { import_id: "b", household_member_id: "m", upload_group_id: "g", },
      { import_id: "c", household_member_id: "m", upload_group_id: "g", },
    ];
    expect(statementCount("m", rows)).toBe(1);
  });

  it("counts a row without a group by its own import id, and two rows with the same import id once", () => {
    const rows = [
      { import_id: "a", household_member_id: "m", upload_group_id: null },
      { import_id: "b", household_member_id: "m", upload_group_id: null },
      { import_id: "b", household_member_id: "m", upload_group_id: null },
    ];
    expect(statementCount("m", rows)).toBe(2);
  });

  it("never counts another member's rows, even in the same group", () => {
    const rows = [
      { import_id: "a", household_member_id: "m", upload_group_id: "g" },
      { import_id: "b", household_member_id: "other", upload_group_id: "g" },
      { import_id: "c", household_member_id: "other", upload_group_id: "h" },
    ];
    expect(statementCount("m", rows)).toBe(1);
    expect(statementCount("other", rows)).toBe(2);
  });
});
