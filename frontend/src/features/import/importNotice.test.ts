import { describe, expect, it } from "vitest";
import { buildImportNotice } from "./importNotice";
import type { ImportConfirmResponse, NewFund, PersonConfirmResult } from "./types";

const fund = (id: string, name: string, extra: Partial<NewFund> = {}): NewFund => ({
  scheme_id: id, scheme_name: name, amc_name: "Example AMC", invested_amount: "1000.00",
  latest_transaction_date: "2026-10-28", transaction_count: 1,
  transactions: [{ date: "2026-10-28", type: "PURCHASE", amount: "1000.00", units: "10.0000" }], ...extra,
});
const person = (name: string, extra: Partial<PersonConfirmResult> = {}): PersonConfirmResult => ({
  person_key: name, member_id: `m-${name}`, name, import_id: `i-${name}`, added: 3, skipped: 0, ...extra,
});
const result = (over: Partial<ImportConfirmResponse> = {}): ImportConfirmResponse => ({
  added: 3, skipped: 1, import_id: "i1", warnings: [], upload_group_id: null, people: [person("Asha", { skipped: 1 })], ...over,
});

describe("buildImportNotice: today's text is unchanged when there are no new funds", () => {
  it("one person, with and without already-saved rows", () => {
    expect(buildImportNotice(result())).toEqual({ text: "3 transactions added · 1 already saved" });
    expect(buildImportNotice(result({ added: 1, skipped: 0 }))).toEqual({ text: "1 transaction added" });
  });
  it("several people keep their detail lines and the warnings", () => {
    const notice = buildImportNotice(result({ added: 5, skipped: 0, warnings: ["One fund needs a price"], people: [person("Asha", { added: 2 }), person("Dev", { added: 3, skipped: 1 })] }));
    // QA fixes, A1: the same text and detail lines (the mobile and older views read them), plus structured fields.
    expect(notice).toEqual({
      text: "5 transactions added",
      details: ["Asha: 2 added", "Dev: 3 added, 1 already saved", "One fund needs a price"],
      members: [{ name: "Asha", added: 2, skipped: 0 }, { name: "Dev", added: 3, skipped: 1 }],
      warnings: ["One fund needs a price"],
    });
  });
  it("an empty new_funds list or a missing one gives the same notice", () => {
    expect(buildImportNotice(result({ people: [person("Asha", { skipped: 1, new_funds: [] })] }))).toEqual({ text: "3 transactions added · 1 already saved" });
  });
});

describe("buildImportNotice: new funds", () => {
  it("says how many new funds and transactions, names up to two funds, and carries the list", () => {
    const funds = [fund("s1", "Alpha Flexi Cap Fund"), fund("s2", "Beta Large Cap Fund")];
    const notice = buildImportNotice(result({ added: 5, skipped: 0, people: [person("Asha", { added: 5, new_funds: funds })] }));
    expect(notice.text).toBe("Import complete · 2 new funds, 5 transactions added");
    expect(notice.details).toEqual(["New funds: Alpha Flexi Cap Fund, Beta Large Cap Fund"]);
    expect(notice.newFunds).toEqual(funds);
  });
  it("uses singular words for one new fund and one transaction", () => {
    const notice = buildImportNotice(result({ added: 1, skipped: 0, people: [person("Asha", { added: 1, new_funds: [fund("s1", "Alpha Flexi Cap Fund")] })] }));
    expect(notice.text).toBe("Import complete · 1 new fund, 1 transaction added");
  });
  it("names two funds and counts the rest", () => {
    const funds = ["A Fund", "B Fund", "C Fund", "D Fund"].map((name, index) => fund(`s${index}`, name));
    const notice = buildImportNotice(result({ added: 9, skipped: 0, people: [person("Asha", { added: 9, new_funds: funds })] }));
    expect(notice.details).toEqual(["New funds: A Fund, B Fund and 2 more"]);
    expect(notice.newFunds).toHaveLength(4);
  });
  it("puts the funds of every person in one list, after the per-person lines", () => {
    const notice = buildImportNotice(result({
      added: 6, skipped: 0,
      people: [person("Asha", { added: 2, new_funds: [fund("s1", "Alpha Fund")] }), person("Dev", { added: 4, new_funds: [fund("s2", "Beta Fund")] })],
    }));
    expect(notice.text).toBe("Import complete · 2 new funds, 6 transactions added");
    expect(notice.details).toEqual(["Asha: 2 added", "Dev: 4 added", "New funds: Alpha Fund, Beta Fund"]);
    expect(notice.newFunds?.map(f => f.scheme_id)).toEqual(["s1", "s2"]);
  });
});
