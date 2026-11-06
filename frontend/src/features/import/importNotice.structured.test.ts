import { describe, expect, it } from "vitest";
import { buildImportNotice } from "./importNotice";
import type { ImportConfirmResponse, NewFund, PersonConfirmResult } from "./types";

const fund = (id: string, name: string): NewFund => ({
  scheme_id: id, scheme_name: name, amc_name: "Example AMC", invested_amount: "1000.00",
  latest_transaction_date: "2026-10-28", transaction_count: 1,
  transactions: [{ date: "2026-10-28", type: "PURCHASE", amount: "1000.00", units: "10.0000" }],
});
const person = (name: string, extra: Partial<PersonConfirmResult> = {}): PersonConfirmResult => ({
  person_key: name, member_id: `m-${name}`, name, import_id: `i-${name}`, added: 3, skipped: 0, ...extra,
});
const result = (over: Partial<ImportConfirmResponse> = {}): ImportConfirmResponse => ({
  added: 3, skipped: 1, import_id: "i1", warnings: [], upload_group_id: null, people: [person("Asha", { skipped: 1 })], ...over,
});

describe("buildImportNotice: structured fields for the notice card (QA fixes, A1)", () => {
  it("new funds add counts, and several people add one member entry each", () => {
    const funds = [fund("s1", "Alpha Fund"), fund("s2", "Beta Fund")];
    const notice = buildImportNotice(result({
      added: 6, skipped: 1, warnings: ["One fund needs a price"],
      people: [person("Asha", { added: 2, skipped: 1, new_funds: [funds[0]] }), person("Dev", { added: 4, new_funds: [funds[1]] })],
    }));
    expect(notice.counts).toEqual({ newFunds: 2, added: 6, skipped: 1 });
    expect(notice.members).toEqual([{ name: "Asha", added: 2, skipped: 1 }, { name: "Dev", added: 4, skipped: 0 }]);
    expect(notice.warnings).toEqual(["One fund needs a price"]);
    // the old text and detail lines are still produced for the views that read them
    expect(notice.text).toBe("Import complete · 2 new funds, 6 transactions added");
    expect(notice.details).toEqual(["Asha: 2 added, 1 already saved", "Dev: 4 added", "New funds: Alpha Fund, Beta Fund", "One fund needs a price"]);
  });
  it("one person with new funds has counts but no member entries and no warnings key", () => {
    const notice = buildImportNotice(result({ added: 1, skipped: 0, people: [person("Asha", { added: 1, new_funds: [fund("s1", "Alpha Fund")] })] }));
    expect(notice.counts).toEqual({ newFunds: 1, added: 1, skipped: 0 });
    expect(notice).not.toHaveProperty("members");
    expect(notice).not.toHaveProperty("warnings");
  });
  it("a notice without new funds has no counts", () => {
    expect(buildImportNotice(result())).not.toHaveProperty("counts");
  });
});
