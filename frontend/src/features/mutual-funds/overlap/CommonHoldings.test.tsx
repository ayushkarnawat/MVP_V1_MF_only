import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { StockHoldingsSummary } from "../types";
import { CommonHoldings } from "./CommonHoldings";

const mount = (data: StockHoldingsSummary | null = fc.stockHoldings(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  renderInShell(<CommonHoldings state={state} data={data} onRetry={onRetry} />, { path: "/portfolio/mutual-funds/overlap" });
const rowIds = () => screen.getAllByTestId(/^common-row-/).map(row => row.getAttribute("data-testid")!.replace("common-row-", ""));
const HDFC_BANK = "INE040A01034";
const NESTLE = "INE239A01024";

describe("the table", () => {
  it("has the numbered heading, the info mark, the hint and the five columns", () => {
    mount();
    expect(screen.getByRole("heading", { name: "1. Common Holdings" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Stocks held by more than one of your funds/ })).toBeInTheDocument();
    expect(screen.getByText("Click a stock to see exactly how much of each fund it's held in.")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Common holdings" })).getAllByRole("columnheader").map(h => h.textContent)).toEqual(
      ["#", "Stock", "Held in", "Total Portfolio Exposure", "Top Funds"]);
  });
  it("shows the ten largest common stocks first, numbered, with the number of funds and the exposure to two places", () => {
    mount();
    expect(rowIds()).toHaveLength(10);
    expect(rowIds()[0]).toBe(HDFC_BANK);
    const first = screen.getByTestId(`common-row-${HDFC_BANK}`);
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("HDFC Bank Ltd");
    expect(first).toHaveTextContent("3 funds");
    expect(screen.getByTestId(`common-exposure-${HDFC_BANK}`)).toHaveTextContent("5.70%");
    expect(screen.getByTestId("common-row-INE018A01030")).toHaveTextContent("2 funds");
    expect(screen.queryByTestId(`common-row-${NESTLE}`)).not.toBeInTheDocument();
  });
  it("draws the exposure bar as a share of the largest stock", () => {
    mount();
    expect(screen.getByTestId(`common-bar-${HDFC_BANK}`)).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("common-bar-INE002A01018")).toHaveStyle({ width: "75.32%" });
  });
  it("shows up to three fund chips by what each fund adds to the stock, with the full name as a tooltip", () => {
    mount();
    const chips = screen.getAllByTestId(new RegExp(`^chip-${HDFC_BANK}-`));
    expect(chips.map(chip => chip.textContent)).toEqual(["KMC", "SB", "JFC"]);
    expect(chips.map(chip => chip.getAttribute("title"))).toEqual(["Kotak Multi Cap Fund", "SBI Bluechip Fund", "JM Flexi Cap Fund"]);
    expect(screen.queryByTestId(`chip-more-${HDFC_BANK}`)).not.toBeInTheDocument();
  });
  it("shows +N for the funds beyond three, and names them in its tooltip", () => {
    const data = fc.stockHoldings();
    const row = data.rows[0];
    row.contributing_funds.push(
      { ...row.contributing_funds[0], scheme_id: "S-X1", scheme_name: "Extra One Fund", stock_weight_pct: "1.00" },
      { ...row.contributing_funds[0], scheme_id: "S-X2", scheme_name: "Extra Two Fund", stock_weight_pct: "0.50" },
    );
    mount(data);
    const more = screen.getByTestId(`chip-more-${HDFC_BANK}`);
    expect(more).toHaveTextContent("+2");
    expect(more.getAttribute("title")).toBe("Also held in: Extra One Fund, Extra Two Fund");
    expect(screen.getByTestId(`common-row-${HDFC_BANK}`)).toHaveTextContent("5 funds");
  });
});

describe("expanding a stock", () => {
  it("opens the row in place with each fund and the stock's weight inside it, and marks the row open", () => {
    mount();
    const toggle = screen.getByTestId(`common-toggle-${HDFC_BANK}`);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByTestId(`common-detail-${HDFC_BANK}`);
    expect(screen.getByTestId(`common-row-${HDFC_BANK}`).nextElementSibling).toBe(detail);
    expect(within(detail).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Kotak Multi Cap Fund — 7.80% of fund", "SBI Bluechip Fund — 9.20% of fund", "JM Flexi Cap Fund — 7.10% of fund",
    ]);
  });
  it("keeps one stock open at a time and closes it on a second click", () => {
    mount();
    fireEvent.click(screen.getByTestId(`common-toggle-${HDFC_BANK}`));
    fireEvent.click(screen.getByTestId("common-toggle-INE090A01021"));
    expect(screen.queryByTestId(`common-detail-${HDFC_BANK}`)).not.toBeInTheDocument();
    expect(screen.getByTestId("common-detail-INE090A01021")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("common-toggle-INE090A01021"));
    expect(screen.queryByTestId("common-detail-INE090A01021")).not.toBeInTheDocument();
  });
});

describe("View all", () => {
  it("offers View all common holdings → only when there are more than ten, shows all thirteen after it, and Show fewer goes back", () => {
    mount();
    const button = screen.getByRole("button", { name: "View all common holdings →" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(rowIds()).toHaveLength(13);
    expect(rowIds().slice(10)).toEqual(["INE030A01027", "INE917I01010", NESTLE]);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rowIds()).toHaveLength(10);
  });
  it("has no button when ten or fewer stocks are common", () => {
    const data = fc.stockHoldings();
    data.rows = data.rows.filter(row => row.contributing_funds.length >= 2).slice(0, 10);
    mount(data);
    expect(rowIds()).toHaveLength(10);
    expect(screen.queryByRole("button", { name: /View all common holdings/ })).not.toBeInTheDocument();
  });
  it("forgets an open stock that is hidden again by Show fewer, so it does not reopen", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View all common holdings →" }));
    fireEvent.click(screen.getByTestId(`common-toggle-${NESTLE}`));
    expect(screen.getByTestId(`common-detail-${NESTLE}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "View all common holdings →" }));
    expect(screen.queryByTestId(`common-detail-${NESTLE}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`common-toggle-${NESTLE}`)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("edge states", () => {
  it("says so when no stock is held by two funds", () => {
    const data = fc.stockHoldings();
    data.rows = data.rows.filter(row => row.contributing_funds.length === 1);
    mount(data);
    expect(screen.getByTestId("common-empty")).toHaveTextContent("No stocks are held by more than one of your funds.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("notes that the look-through list was cut when the section is truncated", () => {
    const data = fc.stockHoldings();
    data.truncated = true;
    data.total_stock_count = 40;
    mount(data);
    expect(screen.getByTestId("common-truncated")).toHaveTextContent("Found among the largest 31 of 40 stocks your funds hold.");
  });
  it("keeps the heading while loading and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const view = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading 1. Common Holdings" })).toBeInTheDocument();
    view.unmount();
    mount(null, "failed", retry);
    expect(screen.getByRole("heading", { name: "1. Common Holdings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = mount();
    fireEvent.click(screen.getByTestId(`common-toggle-${HDFC_BANK}`));
    fireEvent.click(screen.getByRole("button", { name: "View all common holdings →" }));
    expectInteractivity(container, 12);
    for (const chip of container.querySelectorAll("[data-tooltip]")) expect(chip.getAttribute("title")).toBeTruthy();
  });
});

describe("the funds behind a common stock open their fund page (IF-E)", () => {
  it("links each fund listed under an opened stock, and leaves the initials chips and the toggle alone", () => {
    mount();
    const row = screen.getByTestId(`common-row-${HDFC_BANK}`);
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(within(row).getByRole("button"));
    const detail = screen.getByTestId(`common-detail-${HDFC_BANK}`);
    const links = within(detail).getAllByRole("link");
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) {
      const item = link.closest("li")!;
      expect(item.textContent).toMatch(/% of fund$/);
      expect(link.getAttribute("href")).toMatch(/^\/portfolio\/mutual-funds\/funds\/S-[A-Z]+$/);
    }
    expect(document.querySelectorAll("button a")).toHaveLength(0);
  });
});
