import { describe, expect, it } from "vitest";
import type { InvestmentWithdrawalEntry, InvestmentWithdrawalResult } from "../types";
import { ledgerDetail, missedSipTooltip } from "./transactionsLogic";

const entry = (over: Partial<InvestmentWithdrawalEntry> = {}): InvestmentWithdrawalEntry => ({
  transaction_id: "t", date: "2026-01-01", type: "purchase", amount: "1.00", direction: "invested", scheme_name: "F", household_member_id: "m1", household_member_name: "A", ...over,
});
const sip = (over: Partial<InvestmentWithdrawalResult["sip_summary"]> = {}): InvestmentWithdrawalResult["sip_summary"] => ({
  active_count: 2, total_monthly_amount: "10.00", missed_count: 1, ...over,
});

describe("ledgerDetail", () => {
  it("returns null when the entry has none of units, NAV and folio (an old payload, nulls and empty strings alike)", () => {
    expect(ledgerDetail(entry())).toBeNull();
    expect(ledgerDetail(entry({ units: null, nav: null, folio: null }))).toBeNull();
    expect(ledgerDetail(entry({ units: "", nav: "", folio: "" }))).toBeNull();
  });
  it("shows the units as the backend sent them, the NAV in rupees to two places and the folio as masked", () => {
    expect(ledgerDetail(entry({ units: "200.000", nav: "81.2200", folio: "XXXX7890" }))).toEqual({ units: "200.000", nav: "₹81.22", folio: "XXXX7890" });
    expect(ledgerDetail(entry({ units: "412.605", nav: "43.6250", folio: "XXXX6789" }))).toEqual({ units: "412.605", nav: "₹43.63", folio: "XXXX6789" });
    expect(ledgerDetail(entry({ units: "0.500", nav: "43.6249", folio: "XXXX0001" }))).toEqual({ units: "0.500", nav: "₹43.62", folio: "XXXX0001" });
  });
  it("keeps the parts that exist and nulls the others", () => {
    expect(ledgerDetail(entry({ folio: "XXXX6789" }))).toEqual({ units: null, nav: null, folio: "XXXX6789" });
    expect(ledgerDetail(entry({ units: "10.000", nav: null }))).toEqual({ units: "10.000", nav: null, folio: null });
    expect(ledgerDetail(entry({ nav: "88.0000" }))).toEqual({ units: null, nav: "₹88.00", folio: null });
  });
});

describe("missedSipTooltip", () => {
  const GENERIC = "A scheduled SIP instalment did not appear on the latest statement.";
  it("names the fund and the due date when the backend sends both", () => {
    expect(missedSipTooltip(sip({ missed_sip_fund: "HDFC Mid-Cap Opportunities Fund", missed_sip_date: "2026-10-05" }))).toBe("HDFC Mid-Cap Opportunities Fund — SIP due 05 Oct 2026 was not debited");
    expect(missedSipTooltip(sip({ missed_sip_fund: "Kotak Multi Cap Fund", missed_sip_date: "2026-01-31" }))).toBe("Kotak Multi Cap Fund — SIP due 31 Jan 2026 was not debited");
  });
  it("falls back to the generic sentence when either part is missing, null, empty or not a date", () => {
    expect(missedSipTooltip(sip())).toBe(GENERIC);
    expect(missedSipTooltip(sip({ missed_sip_fund: null, missed_sip_date: null }))).toBe(GENERIC);
    expect(missedSipTooltip(sip({ missed_sip_fund: "Kotak Multi Cap Fund" }))).toBe(GENERIC);
    expect(missedSipTooltip(sip({ missed_sip_date: "2026-10-05" }))).toBe(GENERIC);
    expect(missedSipTooltip(sip({ missed_sip_fund: "", missed_sip_date: "2026-10-05" }))).toBe(GENERIC);
    expect(missedSipTooltip(sip({ missed_sip_fund: "Kotak Multi Cap Fund", missed_sip_date: "soon" }))).toBe(GENERIC);
  });
});
