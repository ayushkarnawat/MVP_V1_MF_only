import { describe, expect, it } from "vitest";
import type { SipRow } from "../types";
import { filterHoldingRows, filterSipRows, type SearchableHolding } from "./overviewSearch";

const rows: SearchableHolding[] = [
  { scheme_name: "Example Growth Fund", amc_name: "Orchid AMC", category: "Flexi Cap",
    household_member_id: "asha", household_member_name: "Asha" },
  { scheme_name: "Example Income Fund", amc_name: "Lotus AMC", sebi_category: "Debt",
    household_member_id: "bela", household_member_name: "Bela" },
  { scheme_name: "Family Equity Fund", sebi_category: "Flexi Cap",
    children: [{ household_member_id: "bela", household_member_name: "Bela" }] },
];
const sips: SipRow[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", household_member_id: "asha",
    household_member_name: "Asha", sip_date: "5", sip_amount: "1000.00", next_due_date: "2026-12-05" },
  { scheme_id: "income", scheme_name: "Example Income Fund", household_member_id: "bela",
    household_member_name: "Bela", sip_date: "5", sip_amount: "2000.00", next_due_date: "2026-12-05" },
];

describe("Overview search", () => {
  it("empty text and no chips return the rows untouched", () => {
    expect(filterHoldingRows(rows, "", [])).toBe(rows);
    expect(filterSipRows(sips, "", [])).toBe(sips);
  });

  it("every word must match, in any order", () => {
    expect(filterHoldingRows(rows, "growth example", [])).toEqual([rows[0]]);
    expect(filterHoldingRows(rows, "example growth", [])).toEqual([rows[0]]);
    expect(filterHoldingRows(rows, "growth income", [])).toEqual([]);
  });

  it("a fund house word finds the fund through its alias", () => {
    expect(filterHoldingRows(rows, "orchid", [])).toEqual([rows[0]]);
  });

  it("a category word finds funds of that category", () => {
    expect(filterHoldingRows(rows, "flexi", [])).toEqual([rows[0], rows[2]]);
    expect(filterHoldingRows(rows, "debt", [])).toEqual([rows[1]]);
  });

  it("a member name finds the member's funds, including a family row's children", () => {
    expect(filterHoldingRows(rows, "bela", [])).toEqual([rows[1], rows[2]]);
    expect(filterHoldingRows(rows, "asha growth", [])).toEqual([rows[0]]);
  });

  it("category chip keeps only that category", () => {
    expect(filterHoldingRows(rows, "", [{ kind: "category", value: "fLeXi CaP" }])).toEqual([rows[0], rows[2]]);
    expect(filterHoldingRows(rows, "income", [{ kind: "category", value: "Flexi Cap" }])).toEqual([]);
  });

  it("member chip keeps rows of that member or with a child of that member", () => {
    expect(filterHoldingRows(rows, "", [{ kind: "member", value: "bela" }])).toEqual([rows[1], rows[2]]);
  });

  it("a period chip is ignored on Overview", () => {
    expect(filterHoldingRows(rows, "", [{ kind: "period", value: "2025" }])).toEqual(rows);
    expect(filterHoldingRows(rows, "growth", [{ kind: "period", value: "2025" }])).toEqual([rows[0]]);
  });

  it("SIP rows match by fund and member", () => {
    expect(filterSipRows(sips, "growth", [])).toEqual([sips[0]]);
    expect(filterSipRows(sips, "bela income", [])).toEqual([sips[1]]);
    expect(filterSipRows(sips, "growth bela", [])).toEqual([]);
  });

  it("a member chip filters SIP rows", () => {
    expect(filterSipRows(sips, "", [{ kind: "member", value: "bela" }])).toEqual([sips[1]]);
  });
});
