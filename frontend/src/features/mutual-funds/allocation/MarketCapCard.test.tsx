import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { CapAllocationSummary } from "../types";
import { MarketCapCard } from "./MarketCapCard";
import { renderInShell as render } from "@/shell/testing";

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
  it("shows the heading, the dates with the AMFI classification date, the three buckets and the largest", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Market-Cap Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Equity holdings classified by AMFI market-cap size, looked through every fund you own." })).toBeInTheDocument();
    expect(screen.getByTestId("as-on")).toHaveTextContent("Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026 · AMFI classification effective from 01 Jul 2026.");
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Large Cap61.8%", "Mid Cap29.4%", "Small Cap8.8%"]);
    expect(screen.getByTestId("largest-allocation")).toHaveTextContent("Largest allocation: Large Cap (61.8%)");
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
  it("always describes classified equity without a denominator toggle", () => {
    mount();
    expect(screen.queryByRole("group", { name: "Allocation denominator" })).not.toBeInTheDocument();
    expect(legend().getAllByRole("button")).toHaveLength(3);
  });
  it("shows the empty state when there is no equity", () => {
    const data = classifiedData();
    data.total_equity_value = "0.00";
    data.unclassified_share_pct = "100.00";
    data.buckets.forEach(bucket => { bucket.percentage_classified = "0.00"; });
    mount(data);
    expect(screen.getByText("Not enough classified equity")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Market-cap breakdown" })).not.toBeInTheDocument();
  });
});

describe("the donut and the legend", () => {
  it("swaps the centre label and shows the popup while a legend row is hovered", () => {
    mount();
    fireEvent.mouseEnter(screen.getByTestId("legend-mid"));
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Mid Cap");
    expect(screen.getByTestId("donut-centre-pct")).toHaveTextContent("29.4%");
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
  it("changes the selected bucket when another slice is clicked", () => {
    mount();
    fireEvent.click(row(/Mid Cap/));
    fireEvent.click(row(/Large Cap/));
    expect(row(/Large Cap/)).toHaveAttribute("aria-pressed", "true");
    expect(row(/Mid Cap/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("region", { name: "Large Cap detail" })).toBeInTheDocument();
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

describe("the funds behind a stock open their fund page (IF-E)", () => {
  it("links each fund in the opened stock, keeping the weights and the age note", () => {
    mount();
    fireEvent.click(row(/Large Cap/));
    fireEvent.click(within(screen.getByTestId("stock-0")).getByRole("button"));
    const kotak = screen.getByTestId("stock-0-fund-S-KOTAK");
    expect(within(kotak).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
    expect(kotak).toHaveTextContent("Kotak Multi Cap Fund · 7.80% of fund · 2.58% of portfolio");
    expect(within(screen.getByTestId("stock-0-fund-S-SBI")).getByRole("link", { name: "SBI Bluechip Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-SBI");
    expect(document.querySelectorAll("button a")).toHaveLength(0);
  });
});


function classifiedData() {
  const data = fb.capAllocation();
  Object.assign(data, { unclassified_share_pct: "12.82" });
  data.buckets.forEach((bucket, index) => Object.assign(bucket, { percentage_classified: ["61.76", "29.41", "8.83", "0.00"][index] }));
  return data;
}

describe("classified equity", () => {
  it("renders three slices and no Other slice", () => {
    mount(classifiedData());
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Large Cap61.8%", "Mid Cap29.4%", "Small Cap8.8%"]);
    for (const key of ["large", "mid", "small"]) expect(screen.getByTestId(`slice-${key}`)).toBeInTheDocument();
    expect(screen.queryByTestId("slice-other")).not.toBeInTheDocument();
    expect(screen.queryByTestId("legend-other")).not.toBeInTheDocument();
  });
  it("shows the note only when unclassified is 0.5 percent or more", () => {
    const data = classifiedData();
    Object.assign(data, { unclassified_share_pct: "0.50" });
    const view = mount(data);
    expect(screen.getByText("0.5% of your equity could not be sorted into Large, Mid or Small (for example overseas stocks), so the three slices describe the other 99.5%.")).toBeInTheDocument();
    Object.assign(data, { unclassified_share_pct: "0.49" });
    view.rerender(<MarketCapCard state="ready" data={data} onRetry={vi.fn()} />);
    expect(screen.queryByText(/of your equity could not be sorted/)).not.toBeInTheDocument();
  });
  it("shows 'Not enough classified equity' when none classified", () => {
    const data = classifiedData();
    Object.assign(data, { unclassified_share_pct: "100.00" });
    data.buckets.forEach(bucket => Object.assign(bucket, { percentage_classified: "0.00" }));
    mount(data);
    expect(screen.getByText("Not enough classified equity")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Market-cap allocation chart" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("largest-allocation")).not.toBeInTheDocument();
  });
  it("renders a payload without the new fields as the updating state", () => {
    const old = fb.capAllocation();
    delete old.unclassified_share_pct;
    old.buckets.forEach(bucket => { delete bucket.percentage_classified; });
    mount(old);
    expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
    expect(screen.getByRole("heading", { name: "Market-Cap Allocation" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Market-cap allocation chart" })).not.toBeInTheDocument();
  });
});


it("treats defaulted empty strings and a missing bucket percentage as updating", () => {
  const data = classifiedData();
  data.unclassified_share_pct = "";
  const view = mount(data);
  expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
  data.unclassified_share_pct = "12.82";
  delete data.buckets[0].percentage_classified;
  view.rerender(<MarketCapCard state="ready" data={data} onRetry={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
  expect(screen.queryByRole("img", { name: "Market-cap allocation chart" })).not.toBeInTheDocument();
});
