import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fa from "../fixtures/mfAsks";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { AssetAllocationSummary } from "../types";
import { AssetClassCard } from "./AssetClassCard";
import { renderInShell as render } from "@/shell/testing";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const mount = (data: AssetAllocationSummary | null = fa.assetAllocationWithFunds()) => render(<AssetClassCard state="ready" data={data} onRetry={vi.fn()} />);
const legend = () => within(screen.getByRole("list", { name: "Look-through asset breakdown" }));
const select = (label: RegExp) => fireEvent.click(legend().getByRole("button", { name: label }));
const fundList = () => within(screen.getByRole("list", { name: "Contributing funds" }));
const rowOf = (id: string) => ({
  name: screen.getByTestId(`drill-fund-name-${id}`).textContent,
  value: screen.getByTestId(`drill-fund-value-${id}`).textContent,
});
const GAP_NOTE = "A fund-by-fund breakdown isn't available for this class yet; the look-through produces one total for it.";

describe("the contributing funds in the drill panel", () => {
  it("lists the funds of the equity class largest first, each with its value and its share of equity", () => {
    mount();
    select(/Equity/);
    expect(screen.getByTestId("drill-funds-title")).toHaveTextContent("Contributing funds");
    expect(fundList().getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual([
      "drill-fund-S-KOTAK", "drill-fund-S-JM", "drill-fund-S-HDFC", "drill-fund-S-HDARB", "drill-fund-S-SBI",
    ]);
    expect(rowOf("S-KOTAK")).toEqual({ name: "Kotak Multi Cap Fund", value: "₹11,90,000 · 35.9% of Equity" });
    expect(rowOf("S-JM")).toEqual({ name: "JM Flexi Cap Fund", value: "₹8,92,500 · 26.9% of Equity" });
    expect(rowOf("S-HDARB")).toEqual({ name: "HDFC Arbitrage Fund", value: "₹3,40,000 · 10.3% of Equity" });
    expect(rowOf("S-SBI")).toEqual({ name: "SBI Bluechip Fund", value: "₹2,97,500 · 9.0% of Equity" });
  });
  it("keeps the contributing funds before the market-cap link without repeating its size split", () => {
    mount();
    select(/Equity/);
    expect(screen.queryByTestId("drill-cap-large")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Contributing funds" });
    const link = screen.getByRole("button", { name: "See the stock-level split in Market-Cap Allocation" });
    expect(list.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("drill-class-total")).toHaveTextContent("Equity total: ₹33,15,000 · 78.0%");
  });
  it("shows the merged Debt and Gold contributing funds", () => {
    mount();
    select(/Debt/);
    expect(screen.queryByTestId("drill-gap-note")).not.toBeInTheDocument();
    expect(fundList().getAllByRole("listitem")).toHaveLength(3);
    expect(rowOf("S-HDOV").value).toBe("₹5,52,500 · 76.5% of Debt");
    expect(rowOf("S-SBI").value).toBe("₹1,19,000 · 16.5% of Debt");
    expect(screen.queryByTestId("drill-cap-large")).not.toBeInTheDocument();
    select(/Gold/);
    expect(rowOf("S-AXINT")).toEqual({ name: "Axis International Fund of Fund", value: "₹2,12,500 · 100.0% of Gold" });
    select(/Debt/);
    expect(rowOf("S-KOTAK").value).toBe("₹51,000 · 7.1% of Debt");
  });
  it("lists a fund under each class it contributes to, with that class's own figures", () => {
    mount();
    select(/Equity/);
    expect(rowOf("S-SBI").value).toBe("₹2,97,500 · 9.0% of Equity");
    select(/Debt/);
    expect(rowOf("S-SBI").value).toBe("₹1,19,000 · 16.5% of Debt");
  });
  it("follows the arbitrage switch: the funds of the selected class come from the variant on screen", () => {
    mount();
    select(/Equity/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Treat arbitrage funds as cash-like" }));
    expect(fundList().getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual(["drill-fund-S-KOTAK", "drill-fund-S-JM", "drill-fund-S-HDFC", "drill-fund-S-SBI"]);
    expect(rowOf("S-KOTAK").value).toBe("₹11,90,000 · 40.0% of Equity");
    expect(rowOf("S-SBI").value).toBe("₹2,97,500 · 10.0% of Equity");
    select(/Debt/);
    expect(fundList().getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual(["drill-fund-S-HDOV", "drill-fund-S-HDARB", "drill-fund-S-SBI", "drill-fund-S-KOTAK"]);
    expect(rowOf("S-HDARB").value).toBe("₹3,40,000 · 32.0% of Debt");
    expect(rowOf("S-HDOV").value).toBe("₹5,52,500 · 52.0% of Debt");
    expect(rowOf("S-KOTAK").value).toBe("₹51,000 · 4.8% of Debt");
  });
  it("says so, without the old note, when a class has an empty list of funds", () => {
    const data = fa.assetAllocationWithFunds();
    data.as_disclosed.classes[2].funds = [];
    mount(data);
    select(/Gold/);
    expect(screen.queryByRole("list", { name: "Contributing funds" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("drill-gap-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("drill-funds-empty")).toHaveTextContent("No fund adds a positive amount to this class.");
  });
  it("hides the whole element and keeps the old behaviour on an old payload", () => {
    mount(fb.assetAllocation());
    select(/Equity/);
    expect(screen.queryByTestId("drill-funds-title")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Contributing funds" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("drill-cap-large")).not.toBeInTheDocument();
    select(/Debt/);
    expect(screen.getByTestId("drill-gap-note")).toHaveTextContent(GAP_NOTE);
    expect(screen.queryByTestId("drill-funds-empty")).not.toBeInTheDocument();
  });
  it("treats null funds like absent funds", () => {
    const data = fa.assetAllocationWithFunds();
    data.as_disclosed.classes[1].funds = null;
    mount(data);
    select(/Debt/);
    expect(screen.getByTestId("drill-gap-note")).toHaveTextContent(GAP_NOTE);
  });
  it("adds no control: the fund rows are plain text, and every existing control stays marked", () => {
    const { container } = mount();
    select(/Equity/);
    expect(fundList().queryAllByRole("button")).toEqual([]);
    expectInteractivity(container, 8);
  });
});

describe("the contributing funds open their fund page (IF-E)", () => {
  it("links every contributing fund of the equity class, in the same order", () => {
    mount();
    select(/Equity/);
    const links = fundList().getAllByRole("link");
    expect(links.map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Kotak Multi Cap Fund", "/portfolio/mutual-funds/funds/S-KOTAK"],
      ["JM Flexi Cap Fund", "/portfolio/mutual-funds/funds/S-JM"],
      ["HDFC Mid-Cap Opportunities Fund", "/portfolio/mutual-funds/funds/S-HDFC"],
      ["HDFC Arbitrage Fund", "/portfolio/mutual-funds/funds/S-HDARB"],
      ["SBI Bluechip Fund", "/portfolio/mutual-funds/funds/S-SBI"],
    ]);
    expect(rowOf("S-KOTAK")).toEqual({ name: "Kotak Multi Cap Fund", value: "₹11,90,000 · 35.9% of Equity" });
  });
  it("shows a fund with no scheme id as plain text", () => {
    const data = fa.assetAllocationWithFunds();
    data.as_disclosed.classes.find(item => item.key === "equity")!.funds![0].scheme_id = "";
    mount(data);
    select(/Equity/);
    expect(fundList().getAllByRole("link")).toHaveLength(4);
    expect(fundList().queryByRole("link", { name: "Kotak Multi Cap Fund" })).toBeNull();
  });
});
