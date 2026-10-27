import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { CapAllocationSummary } from "../types";
import { MarketCapCard } from "./MarketCapCard";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const mount = (data: CapAllocationSummary | null = fb.capAllocation(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  render(<MarketCapCard state={state} data={data} onRetry={onRetry} />);
const legend = () => within(screen.getByRole("list", { name: "Market-cap breakdown" }));
const row = (name: RegExp | string) => legend().getByRole("button", { name });

describe("content", () => {
  it("shows the heading, the dates with the AMFI classification date, the four buckets and the largest", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Market-Cap Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Equity holdings classified by AMFI market-cap size, looked through every fund you own." })).toBeInTheDocument();
    expect(screen.getByTestId("as-on")).toHaveTextContent("Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026 · AMFI classification effective from 01 Jul 2026.");
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Large Cap38.4%", "Mid Cap18.3%", "Small Cap5.5%", "Other / Unclassified37.8%"]);
    expect(screen.getByTestId("largest-allocation")).toHaveTextContent("Largest allocation: Large Cap (38.4%)");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total portfolio");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
  });
  it("shows the full coverage banner", () => {
    mount();
    const banner = screen.getByRole("complementary", { name: "Portfolio disclosure coverage" });
    expect(banner).toHaveTextContent("Based on 91.4% of your portfolio");
    expect(banner).toHaveTextContent("HDFC Overnight Fund — not published yet");
    expect(banner).toHaveTextContent("Derivative and other positions excluded from this view: 2.10% (net disclosed share).");
  });
  it("says when no AMFI classification applies", () => {
    const data = fb.capAllocation();
    data.classification_as_of = null;
    mount(data);
    expect(screen.getByTestId("as-on")).toHaveTextContent("No applicable AMFI classifications for these holdings.");
  });
  it("hides the headline when the backend says the coverage is too thin", () => {
    const data = fb.capAllocation();
    data.hide_headlines = true;
    mount(data);
    expect(screen.queryByTestId("largest-allocation")).not.toBeInTheDocument();
  });
  it("has no chart-type picker: the market-cap card stays a donut", () => {
    mount();
    expect(screen.queryByRole("radiogroup", { name: "Chart type" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Market-cap allocation chart" })).toBeInTheDocument();
  });
  it("has nothing to show and says so, keeping the heading, when no data arrived", () => {
    mount(null);
    expect(screen.getByText("No market-cap allocation data available")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Market-Cap Allocation" })).toBeInTheDocument();
  });
  it("says there are no holdings when the portfolio is empty", () => {
    const data = fb.capAllocation();
    data.total_portfolio_value = "0.00";
    mount(data);
    expect(screen.getByText("No holdings for this selection")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("keeps the heading and shows a loading status", () => {
    mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading Market-Cap Allocation" })).toBeInTheDocument();
  });
  it("offers Retry when the section failed", () => {
    const retry = vi.fn();
    mount(null, "error", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("the denominator", () => {
  it("switches between % of total portfolio and % of equity only, in the legend, the headline and the centre", () => {
    mount();
    const group = within(screen.getByRole("group", { name: "Allocation denominator" }));
    expect(group.getByRole("button", { name: "% of total portfolio" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(group.getByRole("button", { name: "% of equity only" }));
    expect(group.getByRole("button", { name: "% of equity only" })).toHaveAttribute("aria-pressed", "true");
    expect(group.getByRole("button", { name: "% of total portfolio" })).toHaveAttribute("aria-pressed", "false");
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Large Cap53.9%", "Mid Cap25.6%", "Small Cap7.7%", "Other / Unclassified12.8%"]);
    expect(screen.getByTestId("largest-allocation")).toHaveTextContent("Largest allocation: Large Cap (53.9%)");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Equity only");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹33.15 L");
  });
  it("says so when equity-only is chosen and there is no equity", () => {
    const data = fb.capAllocation();
    data.total_equity_value = "0.00";
    mount(data);
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(screen.getByText("No equity holdings for this selection")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Market-cap breakdown" })).not.toBeInTheDocument();
  });
  it("notes negative net positions", () => {
    const data = fb.capAllocation();
    data.buckets[3].percentage_total = "-0.50";
    mount(data);
    expect(screen.getByText("Negative net positions are listed with their signed percentages; the donut shows positive exposures.")).toBeInTheDocument();
  });
});

describe("the donut and the legend", () => {
  it("swaps the centre label and shows the popup while a legend row is hovered", () => {
    mount();
    fireEvent.mouseEnter(screen.getByTestId("legend-mid"));
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Mid Cap");
    expect(screen.getByTestId("donut-centre-pct")).toHaveTextContent("18.3%");
    expect(screen.getByTestId("donut-popup")).toHaveAttribute("data-visible", "true");
    expect(screen.getByTestId("popup-value")).toHaveTextContent("₹8,50,000");
    fireEvent.mouseLeave(screen.getByTestId("legend-mid"));
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total portfolio");
  });
  it("selects a bucket from a slice as well as from the legend", () => {
    mount();
    fireEvent.click(screen.getByTestId("slice-small"));
    expect(row(/Small Cap/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Small Cap detail" })).toBeInTheDocument();
  });
});

describe("the drill panel", () => {
  it("opens under the card titled with the clicked bucket, with its stocks and the largest-of-all note, and keeps the row selected", () => {
    mount();
    expect(screen.queryByTestId("drill-panel")).not.toBeInTheDocument();
    fireEvent.click(row(/Large Cap/));
    const panel = screen.getByRole("region", { name: "Large Cap detail" });
    expect(within(panel).getByRole("heading", { name: "Large Cap" })).toBeInTheDocument();
    expect(within(panel).getByTestId("drill-dot")).toHaveStyle({ backgroundColor: "var(--c1)" });
    expect(within(panel).getByTestId("stock-0")).toHaveTextContent("HDFC Bank Ltd");
    expect(within(panel).getByTestId("stock-0")).toHaveTextContent("₹2,65,064");
    expect(within(panel).getAllByTestId(/^stock-\d+$/)).toHaveLength(6);
    expect(panel).toHaveTextContent("Showing the largest 6 of 15 holdings in this group.");
    expect(row(/Large Cap/)).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseLeave(screen.getByTestId("legend-large"));
    expect(row(/Large Cap/)).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
  });
  it("shows no cut-off note when every holding of the bucket is listed", () => {
    mount();
    fireEvent.click(row(/Mid Cap/));
    expect(within(screen.getByRole("region", { name: "Mid Cap detail" })).getAllByTestId(/^stock-\d+$/)).toHaveLength(8);
    expect(screen.getByRole("region", { name: "Mid Cap detail" })).not.toHaveTextContent("Showing the largest");
  });
  it("expands a stock in place to the funds that hold it, with both weights and the age note, and collapses it again", () => {
    mount();
    fireEvent.click(row(/Large Cap/));
    const stock = screen.getByTestId("stock-0");
    const toggle = within(stock).getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("stock-0-fund-S-KOTAK")).toHaveTextContent("Kotak Multi Cap Fund · 7.80% of fund · 2.58% of portfolio");
    expect(screen.getByTestId("stock-0-fund-S-SBI")).toHaveTextContent("SBI Bluechip Fund · 9.20% of fund · 1.62% of portfolio · on its half-yearly cycle");
    expect(within(stock).getByText("Sector: Financial Services")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("stock-0-fund-S-KOTAK")).not.toBeInTheDocument();
  });
  it("lists the unclassified equity and the non-equity separately for Other / Unclassified", () => {
    mount();
    fireEvent.click(row(/Other \/ Unclassified/));
    const panel = screen.getByRole("region", { name: "Other / Unclassified detail" });
    expect(within(panel).getByRole("heading", { name: "Not equity (debt, cash, gold, REITs)" })).toBeInTheDocument();
    expect(within(panel).getByTestId("other-non-equity-value")).toHaveTextContent("₹13,34,340");
    expect(within(panel).getByTestId("non-equity-0")).toHaveTextContent("7.18% Government of India 2033");
    expect(within(panel).getByRole("heading", { name: "Equity not in AMFI list" })).toBeInTheDocument();
    expect(within(panel).getByTestId("other-unclassified-value")).toHaveTextContent("₹4,25,000");
    expect(within(panel).getByTestId("unclassified-0")).toHaveTextContent("Dixon Technologies (India) Ltd");
  });
  it("leaves the non-equity part out of the equity-only view and says why", () => {
    mount();
    fireEvent.click(row(/Other \/ Unclassified/));
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    const panel = screen.getByRole("region", { name: "Other / Unclassified detail" });
    expect(panel).toHaveTextContent("Excluded from the equity-only view");
    expect(within(panel).queryByTestId("other-non-equity-value")).not.toBeInTheDocument();
    expect(within(panel).getByTestId("other-unclassified-value")).toBeInTheDocument();
  });
  it("keeps the selected bucket when the denominator changes", () => {
    mount();
    fireEvent.click(row(/Mid Cap/));
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(row(/Mid Cap/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Mid Cap detail" })).toBeInTheDocument();
  });
  it("says so for a bucket with no listed stocks", () => {
    const data = fb.capAllocation();
    data.buckets[2].rows = [];
    data.buckets[2].row_count = 0;
    mount(data);
    fireEvent.click(row(/Small Cap/));
    expect(screen.getByText("No holdings in this group")).toBeInTheDocument();
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(row(/Large Cap/));
    fireEvent.click(within(screen.getByTestId("stock-0")).getByRole("button"));
    expectInteractivity(container, 10);
  });
});
