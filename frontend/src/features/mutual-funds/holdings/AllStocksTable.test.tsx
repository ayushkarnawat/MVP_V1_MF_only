import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { StockHoldingsSummary } from "../types";
import { AllStocksTable } from "./AllStocksTable";

const mount = (data: StockHoldingsSummary | null = fb.stockHoldings(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  renderInShell(<AllStocksTable state={state} data={data} onRetry={onRetry} />, { path: "/portfolio/mutual-funds/holdings" });
const names = () => screen.getAllByTestId(/^stock-row-/).map(row => within(row).getAllByRole("button")[0].textContent);
const HDFC = "INE040A01034";
const RELIANCE = "INE002A01018";

describe("the table", () => {
  it("shows the heading, the info mark, the hint and a row per stock with its rank, sector, combined weight and the number of funds", () => {
    mount();
    expect(screen.getByRole("heading", { name: "All Holdings Across Your Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Every distinct stock your funds hold/ })).toBeInTheDocument();
    expect(screen.getByText("Click a stock to see exactly which of your funds hold it, and at what weight within each fund.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "All stock holdings" });
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["#", "Stock", "Portfolio weight", "Held in"]);
    expect(screen.getAllByTestId(/^stock-row-/)).toHaveLength(24);
    const first = screen.getByTestId(`stock-row-${HDFC}`);
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("HDFC Bank Ltd");
    expect(first).toHaveTextContent("Financial Services");
    expect(first).toHaveTextContent("5.70%");
    expect(first).toHaveTextContent("3 funds");
    expect(screen.getByTestId("stock-row-INE262H01021")).toHaveTextContent("1 fund");
  });
  it("counts the stocks and says how many more the portfolio holds", () => {
    mount();
    expect(screen.getByTestId("stock-count")).toHaveTextContent("Showing the largest 24 of 31 distinct stocks held across your funds.");
  });
  it("counts them plainly when nothing was cut", () => {
    const data = fb.stockHoldings();
    data.truncated = false;
    data.total_stock_count = 24;
    mount(data);
    expect(screen.getByTestId("stock-count")).toHaveTextContent("24 distinct stocks held across your funds.");
  });
  it("leaves out anything that is not equity", () => {
    const data = fb.stockHoldings();
    data.rows.push({ ...data.rows[0], isin: "IN-DEBT", instrument_name: "A Bond", asset_type: "debt" });
    mount(data);
    expect(screen.queryByText("A Bond")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^stock-row-/)).toHaveLength(24);
  });
  it("says so when no equity stock is disclosed, and still shows the coverage", () => {
    const data = fb.stockHoldings();
    data.rows = [];
    mount(data);
    expect(screen.getByText("No equity stocks disclosed for this selection")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Portfolio disclosure coverage" })).toBeInTheDocument();
  });
  it("links to the Allocation page for the non-equity share", () => {
    mount();
    const link = screen.getByRole("link", { name: "22.0% in non-equity positions — debt, gold, cash and other holdings" });
    expect(link).toHaveAttribute("href", "/portfolio/mutual-funds/allocation");
  });
  it("keeps the heading in the loading state and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const { unmount } = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading All Holdings Across Your Portfolio" })).toBeInTheDocument();
    unmount();
    mount(null, "error", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("the coverage banner", () => {
  it("shows the full banner: the share, every reason, the age note and the derivative share", () => {
    mount();
    const banner = screen.getByRole("complementary", { name: "Portfolio disclosure coverage" });
    expect(banner).toHaveTextContent("Based on 91.4% of your portfolio");
    expect(banner).toHaveTextContent("HDFC Overnight Fund — not published yet");
    expect(banner).toHaveTextContent("Axis International Fund of Fund — not available from this AMC");
    expect(banner).toHaveTextContent("Axis Midcap Fund — value unavailable; coverage is based on the funds we can value");
    expect(banner).toHaveTextContent("SBI Bluechip Fund — on its half-yearly cycle");
    expect(banner).toHaveTextContent("Derivative and other positions excluded from this view: 2.10% (net disclosed share).");
  });
  it("lists no reasons when every fund is covered", () => {
    const data = fb.stockHoldings();
    data.coverage = { covered_value_pct: "100.00", not_published_yet: [], not_available_from_amc: [], missing_value_schemes: [], funds: data.coverage.funds.map(fund => ({ ...fund, age_tag: null })) };
    data.excluded_share = "0.00";
    mount(data);
    const banner = screen.getByRole("complementary", { name: "Portfolio disclosure coverage" });
    expect(banner).toHaveTextContent("Based on 100.0% of your portfolio");
    expect(within(banner).queryAllByRole("listitem")).toHaveLength(0);
    expect(banner).toHaveTextContent("excluded from this view: 0.00%");
  });
});

describe("sorting", () => {
  it("offers three sorts with By weight pressed first", () => {
    mount();
    const group = within(screen.getByRole("group", { name: "Sort stocks" }));
    expect(group.getAllByRole("button").map(button => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["By weight", "true"], ["By name", "false"], ["By # of funds", "false"],
    ]);
  });
  it("re-sorts in place by name and by number of funds, renumbering the rows", () => {
    mount();
    expect(names().slice(0, 3)).toEqual(["HDFC Bank Ltd", "ICICI Bank Ltd", "Reliance Industries Ltd"]);
    fireEvent.click(screen.getByRole("button", { name: "By name" }));
    expect(screen.getByRole("button", { name: "By name" })).toHaveAttribute("aria-pressed", "true");
    expect(names().slice(0, 3)).toEqual(["Axis Bank Ltd", "Bajaj Finance Ltd", "Bharti Airtel Ltd"]);
    expect(screen.getAllByTestId(/^stock-row-/)[0]).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "By # of funds" }));
    expect(names().slice(0, 7)).toEqual(["HDFC Bank Ltd", "ICICI Bank Ltd", "Reliance Industries Ltd", "Infosys Ltd", "Larsen & Toubro Ltd", "ITC Ltd", "Coforge Ltd"]);
  });
});

describe("expanding a stock in place", () => {
  it("opens the funds that hold it directly under the row, with both weights and the age note", () => {
    mount();
    const toggle = within(screen.getByTestId(`stock-row-${HDFC}`)).getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(`stock-row-${HDFC}`).nextElementSibling).toBe(screen.getByTestId(`stock-detail-${HDFC}`));
    expect(screen.getByTestId(`stock-fund-${HDFC}-S-KOTAK`)).toHaveTextContent("Kotak Multi Cap Fund · 7.80% of fund · 2.58% of portfolio");
    expect(screen.getByTestId(`stock-fund-${HDFC}-S-JM`)).toHaveTextContent("JM Flexi Cap Fund · 7.10% of fund · 1.50% of portfolio");
    expect(screen.getByTestId(`stock-fund-${HDFC}-S-SBI`)).toHaveTextContent("SBI Bluechip Fund · 9.20% of fund · 1.62% of portfolio · on its half-yearly cycle");
    fireEvent.click(toggle);
    expect(screen.queryByTestId(`stock-detail-${HDFC}`)).not.toBeInTheDocument();
  });
  it("keeps one stock open at a time", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`stock-row-${HDFC}`)).getByRole("button"));
    fireEvent.click(within(screen.getByTestId(`stock-row-${RELIANCE}`)).getByRole("button"));
    expect(screen.queryByTestId(`stock-detail-${HDFC}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`stock-detail-${RELIANCE}`)).toBeInTheDocument();
  });
  it("keeps the open stock open, under its row, when the sort changes", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`stock-row-${RELIANCE}`)).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "By name" }));
    expect(screen.getByTestId(`stock-detail-${RELIANCE}`)).toBeInTheDocument();
    expect(screen.getByTestId(`stock-row-${RELIANCE}`).nextElementSibling).toBe(screen.getByTestId(`stock-detail-${RELIANCE}`));
    expect(within(screen.getByTestId(`stock-row-${RELIANCE}`)).getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(within(screen.getByTestId(`stock-row-${HDFC}`)).getByRole("button"));
    expectInteractivity(container, 20);
  });
});

describe("the funds behind a stock open their fund page (IF-E)", () => {
  it("links each fund listed under an opened stock, and keeps the stock row a button", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`stock-row-${HDFC}`)).getByRole("button"));
    const kotak = screen.getByTestId(`stock-fund-${HDFC}-S-KOTAK`);
    expect(within(kotak).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
    expect(kotak).toHaveTextContent("Kotak Multi Cap Fund · 7.80% of fund · 2.58% of portfolio");
    expect(within(screen.getByTestId(`stock-fund-${HDFC}-S-JM`)).getByRole("link", { name: "JM Flexi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-JM");
    expect(within(screen.getByTestId(`stock-detail-${HDFC}`)).getAllByRole("link")).toHaveLength(3);
    expect(document.querySelectorAll("button a")).toHaveLength(0);
  });
});
