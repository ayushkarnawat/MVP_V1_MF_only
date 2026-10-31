import { describe, expect, it } from "vitest";
import * as fa from "./mfAsks";

// Exact decimal helpers: every value is scaled to an integer number of 1/10^6 so no float is ever involved.
const SCALE = 6;
function scaled(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(SCALE, "0").slice(0, SCALE));
}
const sum = (values: string[]) => values.reduce((total, value) => total + scaled(value), 0n);

describe("the ledger fixture", () => {
  it("adds units, NAV and folio to exactly three entries, in the monthly and the yearly buckets", () => {
    const data = fa.investmentWithdrawalWithDetail();
    for (const buckets of [data.monthly, data.yearly]) {
      const detailed = buckets.flatMap(bucket => bucket.entries).filter(entry => entry.units !== undefined || entry.nav !== undefined || entry.folio !== undefined);
      expect(detailed.map(entry => [entry.transaction_id, entry.units, entry.nav, entry.folio])).toEqual([
        ["t-0028", "250.000", "88.0000", "XXXX6789"],
        ["t-0029", null, null, "XXXX6789"],
        ["t-0067", "200.000", "81.2200", "XXXX7890"],
      ]);
    }
  });
  it("keeps units times NAV equal to the amount (exact) where both are present", () => {
    const entries = fa.investmentWithdrawalWithDetail().monthly.flatMap(bucket => bucket.entries).filter(entry => entry.units && entry.nav);
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect((scaled(entry.units!) * scaled(entry.nav!)) / 10n ** BigInt(SCALE)).toBe(scaled(entry.amount));
  });
  it("names the missed SIP and leaves every other figure of the plain fixture alone", () => {
    const data = fa.investmentWithdrawalWithDetail();
    expect(data.sip_summary).toEqual({ active_count: 5, total_monthly_amount: "50575.00", missed_count: 1, missed_sip_fund: "HDFC Mid-Cap Opportunities Fund", missed_sip_date: "2026-10-05" });
    expect(data.total_invested).toBe("941895.00");
    expect(data.monthly).toHaveLength(12);
  });
});

describe("the asset class fixture", () => {
  const data = fa.assetAllocationWithFunds();
  it("has funds on all five classes of both variants whose values add up to the class value", () => {
    for (const variant of [data.as_disclosed, data.arbitrage_as_cash]) {
      expect(variant.classes.map(cls => cls.key)).toEqual(["equity", "debt", "gold", "real_estate", "others"]);
      for (const cls of variant.classes) {
        expect(cls.funds).toBeDefined();
        expect(sum(cls.funds!.map(fund => fund.value))).toBe(scaled(cls.value));
      }
    }
  });
  it("lists each class's funds largest first, with the share of the class to four places", () => {
    for (const variant of [data.as_disclosed, data.arbitrage_as_cash]) {
      for (const cls of variant.classes) {
        const values = cls.funds!.map(fund => scaled(fund.value));
        expect([...values].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))).toEqual(values);
        for (const fund of cls.funds!) {
          const share = (scaled(fund.value) * 1_000_000n) / scaled(cls.value) * 100n; // percent, scaled by 10^6
          const stated = scaled(fund.percentage);
          expect(stated - share <= 100n && share - stated <= 100n).toBe(true); // within 0.0001 of a point
        }
      }
    }
  });
  it("moves HDFC Arbitrage from equity into Debt when arbitrage counts as cash", () => {
    expect(data.as_disclosed.classes[0].funds!.map(fund => fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-HDARB", "S-SBI"]);
    expect(data.arbitrage_as_cash.classes[0].funds!.map(fund => fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI"]);
    expect(data.as_disclosed.classes[1].funds!.map(fund => fund.scheme_id)).toEqual(["S-HDOV", "S-SBI", "S-KOTAK"]);
    expect(data.arbitrage_as_cash.classes[1].funds!.map(fund => fund.scheme_id)).toEqual(["S-HDOV", "S-HDARB", "S-SBI", "S-KOTAK"]);
  });
});

describe("the overlap fixture", () => {
  const data = fa.overlapSummaryWithAsks();
  it("has impact pairs that are the first three pairs above the low band, with up to five drivers each", () => {
    expect(data.impact_pairs!.map(pair => [pair.fund_a.scheme_id, pair.fund_b.scheme_id, pair.overlap_pct, pair.drivers.length])).toEqual([
      ["S-KOTAK", "S-SBI", "40.60", 5], ["S-JM", "S-SBI", "26.40", 4], ["S-KOTAK", "S-JM", "23.70", 4],
    ]);
    expect(data.impact_pairs!.map(pair => pair.overlap_pct)).toEqual(data.pairs_above_low.map(pair => pair.overlap_pct));
  });
  it("derives each driver from the pair's own shared stocks: the smaller weight, and its share of the overlap", () => {
    data.impact_pairs!.forEach((impact, index) => {
      const pair = data.pairs_above_low[index];
      impact.drivers.forEach((driver, position) => {
        const stock = pair.common_stocks[position];
        expect(driver.isin).toBe(stock.isin);
        const smaller = scaled(stock.weight_a) < scaled(stock.weight_b) ? stock.weight_a : stock.weight_b;
        expect(driver.contribution_pct).toBe(smaller);
        const share = (scaled(smaller) * 100_000_000n) / scaled(pair.overlap_pct); // percent, scaled by 10^6
        const stated = scaled(driver.share_of_pair_pct);
        expect(stated - share <= 1n && share - stated <= 1n).toBe(true);
      });
    });
  });
  it("has one pair exactly at the low band, whose shared stocks add up to it, and not in pairs_above_low", () => {
    expect(data.bands.low).toBe("20");
    const [pair] = data.pairs_at_low_boundary!;
    expect(data.pairs_at_low_boundary).toHaveLength(1);
    expect([pair.fund_a.scheme_id, pair.fund_b.scheme_id, pair.overlap_pct, pair.common_total]).toEqual(["S-HDFC", "S-SBI", "20.00", 3]);
    expect(sum(pair.common_stocks.map(stock => (scaled(stock.weight_a) < scaled(stock.weight_b) ? stock.weight_a : stock.weight_b)))).toBe(scaled("20.00"));
    expect(data.pairs_above_low.some(p => p.overlap_pct === "20.00")).toBe(false);
    expect(data.matrix.some(p => p.fund_a.scheme_id === "S-HDFC" && p.fund_b.scheme_id === "S-SBI" && p.overlap_pct === "20.00")).toBe(true);
  });
});

describe("the analytics bundles", () => {
  it("carry the new payloads in the sections the pages read", () => {
    const b = fa.analyticsAsksB().sections;
    expect((b.investment_withdrawal!.payload as { data: { sip_summary: { missed_sip_fund: string } } }).data.sip_summary.missed_sip_fund).toBe("HDFC Mid-Cap Opportunities Fund");
    expect((b.asset_allocation!.payload as { asset_allocation: { as_disclosed: { classes: { funds: unknown[] }[] } } }).asset_allocation.as_disclosed.classes[0].funds).toHaveLength(5);
    const c = fa.analyticsAsksC().sections;
    expect((c.overlap!.payload as { overlap: { impact_pairs: unknown[] } }).overlap.impact_pairs).toHaveLength(3);
    expect((c.overlap!.payload as { overlap: { pairs_at_low_boundary: unknown[] } }).overlap.pairs_at_low_boundary).toHaveLength(1);
  });
});
