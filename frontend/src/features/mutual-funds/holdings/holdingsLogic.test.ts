import { describe, expect, it } from "vitest";
import * as fb from "../fixtures/mfB";
import { equityRows, fundChips, heldInText, medalFor, portfolioShare, relativeWidth, sortStocks, stockKey, topStocksForFund } from "./holdingsLogic";

const rows = () => fb.stockHoldings().rows;

describe("equityRows and stockKey", () => {
  it("keeps equity rows only", () => {
    const data = fb.stockHoldings();
    data.rows.push({ ...data.rows[0], isin: "IN-DEBT", instrument_name: "A Bond", asset_type: "debt" });
    data.rows.push({ ...data.rows[0], isin: "US-1", instrument_name: "Apple Inc", asset_type: "equity_international" });
    const names = equityRows(data).map(row => row.instrument_name);
    expect(names).not.toContain("A Bond");
    expect(names).toContain("Apple Inc");
    expect(names).toHaveLength(25);
  });
  it("keys a stock by its ISIN and falls back to its name", () => {
    expect(stockKey(rows()[0])).toBe("INE040A01034");
    expect(stockKey({ ...rows()[0], isin: null })).toBe("HDFC Bank Ltd");
  });
});

describe("fundChips", () => {
  it("lists every fund that holds a stock, heaviest in the portfolio first, each with one stable colour", () => {
    expect(fundChips(rows()).map(chip => [chip.schemeId, chip.name, chip.weight, chip.color])).toEqual([
      ["S-KOTAK", "Kotak Multi Cap Fund", "33.12", "var(--c1)"],
      ["S-HDFC", "HDFC Mid-Cap Opportunities Fund", "28.18", "var(--c2)"],
      ["S-JM", "JM Flexi Cap Fund", "21.08", "var(--c3)"],
      ["S-SBI", "SBI Bluechip Fund", "17.62", "var(--c4)"],
    ]);
  });
  it("gives the same colours whatever order the rows come in", () => {
    const reversed = [...rows()].reverse();
    expect(fundChips(reversed).map(chip => [chip.schemeId, chip.color])).toEqual(fundChips(rows()).map(chip => [chip.schemeId, chip.color]));
  });
  it("is empty without rows", () => {
    expect(fundChips([])).toEqual([]);
  });
});

describe("topStocksForFund", () => {
  it("takes the fund's ten largest positions by weight inside the fund and sums their weights exactly", () => {
    const { stocks, total } = topStocksForFund(rows(), "S-KOTAK");
    expect(stocks).toHaveLength(10);
    expect(stocks.map(stock => [stock.rank, stock.name, stock.weight]).slice(0, 3)).toEqual([[1, "HDFC Bank Ltd", "7.80"], [2, "ICICI Bank Ltd", "6.90"], [3, "Reliance Industries Ltd", "5.60"]]);
    expect(stocks[9]).toMatchObject({ rank: 10, name: "Tata Consultancy Services Ltd", weight: "3.00" });
    expect(stocks.map(stock => stock.name)).not.toContain("Mahindra & Mahindra Ltd");
    expect(total).toBe("47.20");
  });
  it("lists fewer when the fund holds fewer", () => {
    const { stocks, total } = topStocksForFund(rows(), "S-SBI");
    expect(stocks).toHaveLength(6);
    expect(total).toBe("42.30");
  });
  it("sorts by the weight inside this fund, not by the weight in the portfolio", () => {
    const names = topStocksForFund(rows(), "S-JM").stocks.map(stock => stock.name);
    expect(names.slice(0, 3)).toEqual(["ICICI Bank Ltd", "HDFC Bank Ltd", "Infosys Ltd"]);
  });
  it("breaks a tie by name and honours a smaller limit", () => {
    const data = rows().slice(0, 2).map(row => ({ ...row, contributing_funds: row.contributing_funds.filter(fund => fund.scheme_id === "S-KOTAK").map(fund => ({ ...fund, stock_weight_pct: "5.00" })) }));
    expect(topStocksForFund(data, "S-KOTAK").stocks.map(stock => stock.name)).toEqual(["HDFC Bank Ltd", "ICICI Bank Ltd"]);
    expect(topStocksForFund(data, "S-KOTAK", 1).stocks).toHaveLength(1);
  });
  it("is empty for a fund that holds nothing", () => {
    expect(topStocksForFund(rows(), "S-NOPE")).toEqual({ stocks: [], total: "0" });
  });
});

describe("medals and bars", () => {
  it("gives gold, silver and bronze to the first three ranks and nothing after", () => {
    expect([1, 2, 3, 4, 10].map(medalFor)).toEqual(["gold", "silver", "bronze", null, null]);
  });
  it("scales a bar to the largest weight in the list", () => {
    const stocks = [{ weight: "7.80" }, { weight: "6.90" }, { weight: "3.00" }];
    expect(relativeWidth("7.80", stocks)).toBe("100");
    expect(relativeWidth("6.90", stocks)).toBe("88.46");
    expect(relativeWidth("3.00", stocks)).toBe("38.46");
    expect(relativeWidth("0.00", [{ weight: "0.00" }])).toBe("0");
  });
});

describe("sortStocks", () => {
  it("sorts by portfolio weight, largest first", () => {
    expect(sortStocks(rows(), "weight").slice(0, 3).map(row => row.instrument_name)).toEqual(["HDFC Bank Ltd", "ICICI Bank Ltd", "Reliance Industries Ltd"]);
  });
  it("sorts by name", () => {
    expect(sortStocks(rows(), "name").slice(0, 3).map(row => row.instrument_name)).toEqual(["Axis Bank Ltd", "Bajaj Finance Ltd", "Bharti Airtel Ltd"]);
  });
  it("sorts by the number of funds holding it, then by weight", () => {
    expect(sortStocks(rows(), "funds").slice(0, 7).map(row => row.instrument_name)).toEqual([
      "HDFC Bank Ltd", "ICICI Bank Ltd", "Reliance Industries Ltd", "Infosys Ltd", "Larsen & Toubro Ltd", "ITC Ltd", "Coforge Ltd",
    ]);
  });
  it("gives the same order whatever order the rows arrive in", () => {
    const shuffled = [...rows()].reverse();
    for (const sort of ["weight", "name", "funds"] as const) {
      expect(sortStocks(shuffled, sort).map(row => row.instrument_name)).toEqual(sortStocks(rows(), sort).map(row => row.instrument_name));
    }
  });
  it("does not change the list it was given", () => {
    const original = rows();
    const before = original.map(row => row.instrument_name);
    sortStocks(original, "name");
    expect(original.map(row => row.instrument_name)).toEqual(before);
  });
});

describe("text helpers", () => {
  it("counts the funds, singular and plural", () => {
    expect(heldInText(rows()[0])).toBe("3 funds");
    expect(heldInText({ ...rows()[0], contributing_funds: [rows()[0].contributing_funds[0]] })).toBe("1 fund");
  });
  it("gives a fund's share of the portfolio through a stock, exactly", () => {
    expect(portfolioShare("33.12", "7.80")).toBe("2.583360");
  });
});
