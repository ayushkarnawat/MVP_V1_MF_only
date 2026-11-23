import { describe, expect, it } from "vitest";
import type { InvestmentWithdrawalEntry } from "../types";
import type { LedgerRow } from "./transactionsLogic";
import { searchLedgerRows, typeWordToFilter } from "./ledgerSearch";

function row(id: string, date: string, direction: InvestmentWithdrawalEntry["direction"],
  kind: LedgerRow["kind"], amount = "50000.00", member = "asha"): LedgerRow {
  return { kind, entry: { transaction_id: id, date, type: kind, direction, amount,
    scheme_name: member === "asha" ? "Example Growth Fund" : "Example Income Fund",
    household_member_id: member, household_member_name: member === "asha" ? "Asha" : "Bela" } };
}
const rows: LedgerRow[] = [
  row("purchase", "2026-11-10", "invested", "purchase"),
  row("reversal", "2026-10-10", "reversal", "reversal", "5000.00"),
  row("redemption", "2026-10-05", "withdrawn", "redemption", "50000.01", "bela"),
  row("switch", "2025-10-01", "switched_out", "switch", "150000.00", "bela"),
  row("precise", "2025-09-01", "invested", "purchase", "9007199254740993.01"),
  row("nearby", "2025-09-01", "invested", "purchase", "9007199254740993.02"),
];

describe("ledger search", () => {
  it("typeWordToFilter maps the three words and nothing else", () => {
    expect(typeWordToFilter("purchase")).toBe("purchases");
    expect(typeWordToFilter("redemption")).toBe("redemptions");
    expect(typeWordToFilter("switch")).toBe("switches");
    for (const word of [undefined, "", "reversal", "all", "purchases", "unknown"]) {
      expect(typeWordToFilter(word)).toBeNull();
    }
  });

  it("fund and member words filter the rows", () => {
    expect(searchLedgerRows(rows, "bela income", [])).toEqual([rows[2], rows[3]]);
    expect(searchLedgerRows(rows, "growth asha", [])).toEqual([rows[0], rows[1], rows[4], rows[5]]);
    expect(searchLedgerRows(rows, "growth bela", [])).toEqual([]);
  });

  it("a type word keeps only that kind (a reversal counts as a purchase as filterFor says)", () => {
    expect(searchLedgerRows(rows, "purchase", [])).toEqual([rows[0], rows[1], rows[4], rows[5]]);
    expect(searchLedgerRows(rows, "redemption", [])).toEqual([rows[2]]);
    expect(searchLedgerRows(rows, "switch", [])).toEqual([rows[3]]);
  });

  it("a year keeps that year", () => {
    expect(searchLedgerRows(rows, "2026", [])).toEqual([rows[0], rows[1], rows[2]]);
  });

  it("a month and a year keep that month", () => {
    expect(searchLedgerRows(rows, "October 2026", [])).toEqual([rows[1], rows[2]]);
    expect(searchLedgerRows(rows, "2026 oct", [])).toEqual([rows[1], rows[2]]);
  });

  it("an amount matches as a decimal, not as text", () => {
    expect(searchLedgerRows(rows, "₹50,000", [])).toEqual([rows[0]]);
    expect(searchLedgerRows(rows, "50000.000", [])).toEqual([rows[0]]);
    expect(searchLedgerRows(rows, "9007199254740993.010", [])).toEqual([rows[4]]);
  });

  it("a member chip filters", () => {
    expect(searchLedgerRows(rows, "", [{ kind: "member", value: "bela" }])).toEqual([rows[2], rows[3]]);
    expect(searchLedgerRows(rows, "redemption", [{ kind: "member", value: "asha" }])).toEqual([]);
  });

  it("period chips filter by year and by month", () => {
    expect(searchLedgerRows(rows, "", [{ kind: "period", value: "2026" }])).toEqual(rows.slice(0, 3));
    expect(searchLedgerRows(rows, "", [{ kind: "period", value: "2026-10" }])).toEqual([rows[1], rows[2]]);
  });

  it("order is kept", () => {
    const reversed = [...rows].reverse();
    const result = searchLedgerRows(reversed, "asha", []);
    expect(result).toEqual([rows[5], rows[4], rows[1], rows[0]]);
    expect(result[0]).toBe(rows[5]);
  });

  it("empty input returns the rows unchanged", () => {
    expect(searchLedgerRows(rows, "", [])).toBe(rows);
    expect(searchLedgerRows(rows, "", [{ kind: "category", value: "Debt" }])).toEqual(rows);
  });
});
