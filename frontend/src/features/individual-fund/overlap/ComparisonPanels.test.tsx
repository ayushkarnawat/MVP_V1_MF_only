import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures";
import type { OverlapCompareResponse } from "../types";
import { MarketCapPanel, SectorComparisonPanel } from "./BarPanels";
import { CommonHoldingsPanel, UniqueHoldingsPanel } from "./HoldingsPanels";

const A = "Alpha Flexi Cap Fund - Direct Plan";
const B = "Golden Peer 1 Fund";
const golden = () => fixture<OverlapCompareResponse>("overlap_compare");
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map(cell => cell.textContent);

describe("CommonHoldingsPanel", () => {
  it("lists each common stock with its weight in both funds and the rupee exposure across both, in the API order", () => {
    render(<CommonHoldingsPanel data={golden()} />);
    const table = screen.getByRole("table", { name: "Common holdings of the two funds" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Stock", "Sector", A, B, "Combined"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(cells)).toEqual([
      ["Golden Stock 3", "Industrials", "7.0%", "10.0%", "₹170"],
      ["Golden Stock 2", "IT", "6.0%", "10.0%", "₹147"],
      ["Golden Stock 1", "Financial Services", "5.0%", "10.0%", "₹125"],
    ]);
  });

  it("uses the response's own numbers (the handoff's F against G example): 10% and 5% make a combined 75 rupees", () => {
    const data = golden();
    data.common_holdings = [{ isin: "INE000X00001", name: "Stock X1", sector: "IT", weight_a: "10.0000", weight_b: "5.0000", combined: "75.00" }];
    render(<CommonHoldingsPanel data={data} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map(cells)).toEqual([["Stock X1", "IT", "10.0%", "5.0%", "₹75"]]);
  });

  it("each row carries a tooltip with the exact figures", () => {
    render(<CommonHoldingsPanel data={golden()} />);
    expect(screen.getByTestId("compare-common-INEGOLD00002")).toHaveAttribute(
      "title", `Golden Stock 3: 7.0% of ${A}, 10.0% of ${B}, ₹170 combined`,
    );
  });

  it("two funds with nothing in common get a sentence, not an empty table", () => {
    const data = golden();
    data.common_holdings = [];
    render(<CommonHoldingsPanel data={data} />);
    expect(screen.getByTestId("compare-common-empty")).toHaveTextContent("These two funds hold no stock in common.");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("UniqueHoldingsPanel", () => {
  it("shows the five largest unique stocks of each fund with the sector and weight; a fund with none says every stock is shared", () => {
    render(<UniqueHoldingsPanel data={golden()} />);
    expect(screen.getByText("The five largest stocks only one of the two funds holds.")).toBeInTheDocument();
    const a = screen.getByRole("region", { name: `Unique to ${A}` });
    expect(within(a).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Golden Stock 4 Healthcare8.0%", "Golden Stock 8 Healthcare8.0%", "Golden Stock 12 Other8.0%", "Golden Stock 7 Industrials7.0%", "Golden Stock 11 Industrials7.0%",
    ]);
    const b = screen.getByRole("region", { name: `Unique to ${B}` });
    expect(within(b).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByTestId("unique-b-empty")).toHaveTextContent(`Every stock ${B} holds is also in ${A}.`);
  });

  it("rows have a tooltip with the exact figure", () => {
    render(<UniqueHoldingsPanel data={golden()} />);
    expect(screen.getByText("Golden Stock 4").closest("li")).toHaveAttribute("title", "Golden Stock 4 (Healthcare): 8.0% of the fund");
  });
});

describe("SectorComparisonPanel", () => {
  it("one row per sector with the common, A and B shares, in the API order", () => {
    render(<SectorComparisonPanel data={golden()} />);
    const table = screen.getByRole("table", { name: "Sector comparison" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Sector", "Common to both", A, B]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(row => [within(row).getByRole("rowheader").textContent, ...cells(row)])).toEqual([
      ["Industrials", "7.0%", "21.0%", "10.0%"],
      ["IT", "6.0%", "18.0%", "10.0%"],
      ["Financial Services", "5.0%", "15.0%", "10.0%"],
      ["Healthcare", "0.0%", "16.0%", "0.0%"],
      ["Other", "0.0%", "8.0%", "0.0%"],
    ]);
  });

  it("bars share one scale (the widest figure in the table, 21%) and a row tooltip states the exact figures", () => {
    render(<SectorComparisonPanel data={golden()} />);
    expect(screen.getByTestId("sector-bar-a-Industrials").style.width).toBe("100%");
    expect(screen.getByTestId("sector-bar-b-Industrials").style.width).toBe("47.62%");
    expect(screen.getByTestId("sector-bar-common-Industrials").style.width).toBe("33.33%");
    expect(screen.getByTestId("sector-bar-a-Healthcare").style.width).toBe("76.19%");
    expect(screen.getByTestId("sector-bar-common-Healthcare").style.width).toBe("0%");
    expect(screen.getByTestId("sector-compare-Industrials")).toHaveAttribute(
      "title", `Industrials: 7.0% common to both, 21.0% of ${A}, 10.0% of ${B}`,
    );
  });

  it("no sector rows reads as a sentence", () => {
    const data = golden();
    data.sector_comparison = [];
    render(<SectorComparisonPanel data={data} />);
    expect(screen.getByTestId("compare-sector-empty")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("MarketCapPanel", () => {
  it("test_market_cap_subtab_uses_response_market_cap_buckets: Large, Mid, Small and Other for each fund, straight from the response", () => {
    const data = golden();
    data.market_cap = {
      a: { large: "60.0000", mid: "30.0000", small: "10.0000", other: "0.0000" },
      b: { large: "70.0000", mid: "20.0000", small: "5.0000", other: "5.0000" },
    };
    render(<MarketCapPanel data={data} />);
    const table = screen.getByRole("table", { name: "Market cap comparison" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Size", A, B]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(row => [within(row).getByRole("rowheader").textContent, ...cells(row)])).toEqual([
      ["Large Cap", "60.0%", "70.0%"], ["Mid Cap", "30.0%", "20.0%"], ["Small Cap", "10.0%", "5.0%"], ["Other", "0.0%", "5.0%"],
    ]);
    expect(screen.getByTestId("marketcap-bar-a-large").style.width).toBe("60%");
    expect(screen.getByTestId("marketcap-bar-b-large").style.width).toBe("70%");
    expect(screen.getByTestId("marketcap-bar-a-other").style.width).toBe("0%");
    expect(screen.getByTestId("marketcap-large")).toHaveAttribute("title", `Large Cap: 60.0% of ${A}, 70.0% of ${B}`);
  });

  it("on the golden both funds are in equal thirds", () => {
    render(<MarketCapPanel data={golden()} />);
    expect(cells(screen.getByTestId("marketcap-large"))).toEqual(["33.3%", "33.3%"]);
    expect(screen.getByTestId("marketcap-bar-a-mid").style.width).toBe("33.33%");
    expect(screen.getByText("Share of each fund's stocks by company size.")).toBeInTheDocument();
  });
});
