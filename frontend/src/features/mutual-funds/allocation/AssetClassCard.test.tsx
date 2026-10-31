import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { AssetAllocationSummary } from "../types";
import { renderInShell as render } from "@/shell/testing";
import { AssetClassCard } from "./AssetClassCard";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const mount = (data: AssetAllocationSummary | null = fb.assetAllocation(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  render(<AssetClassCard state={state} data={data} onRetry={onRetry} />);
const legend = () => within(screen.getByRole("list", { name: "Look-through asset breakdown" }));

describe("content", () => {
  it("shows the heading, the info mark, the dates, the explanation, the centre and the five classes with one-place percentages", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Look-Through Asset Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "What your money is really in once mutual fund holdings are looked through to equity, debt, gold, real estate and other holdings." })).toBeInTheDocument();
    expect(screen.getByTestId("as-on")).toHaveTextContent("Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026");
    expect(screen.getByText("Cash is included under Debt")).toBeInTheDocument();
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Covered value");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹42.50 L");
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Equity78.0%", "Debt17.0%", "Gold5.0%", "Real Estate (REITs and InvITs)0.0%"]);
    expect(screen.getByTestId("largest-asset-class")).toHaveTextContent("Largest asset class: Equity (78.0%)");
  });
  it("shows the full coverage banner: share, each reason, the age note and the derivative share", () => {
    mount();
    const banner = screen.getByRole("complementary", { name: "Portfolio disclosure coverage" });
    expect(banner).toHaveTextContent("Based on 91.4% of your portfolio");
    expect(banner).toHaveTextContent("HDFC Overnight Fund — not published yet");
    expect(banner).toHaveTextContent("Axis International Fund of Fund — not available from this AMC");
    expect(banner).toHaveTextContent("Axis Midcap Fund — value unavailable; coverage is based on the funds we can value");
    expect(banner).toHaveTextContent("SBI Bluechip Fund — on its half-yearly cycle");
    expect(banner).toHaveTextContent("Derivative and other positions excluded from this view: 2.10% (net disclosed share).");
  });
  it("hides the largest-class headline when the backend says the coverage is too thin", () => {
    const data = fb.assetAllocation();
    data.hide_headlines = true;
    mount(data);
    expect(screen.queryByTestId("largest-asset-class")).not.toBeInTheDocument();
  });
  it("notes negative net positions and draws them as zero", () => {
    const data = fb.assetAllocation();
    data.as_disclosed.classes[1] = { key: "debt", value: "-127500.00", percentage: "-3.00" };
    mount(data);
    expect(screen.getByText("Negative net positions are listed with their signed percentages; the donut shows positive exposures.")).toBeInTheDocument();
    expect(legend().getByRole("button", { name: /Debt/ })).toHaveTextContent("-3.0%");
  });
  it("says so when nothing is covered", () => {
    const data = fb.assetAllocation();
    data.covered_value = "0.00";
    mount(data);
    expect(screen.getByText("No look-through asset allocation data available")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Look-Through Asset Allocation" })).toBeInTheDocument();
  });
});

describe("states", () => {
  it("keeps the heading and shows a loading status", () => {
    mount(null, "loading");
    expect(screen.getByRole("heading", { name: "Look-Through Asset Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading Look-Through Asset Allocation" })).toBeInTheDocument();
  });
  it("shows the standard failure line with a Retry that calls back", () => {
    const retry = vi.fn();
    mount(null, "failed", retry);
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("arbitrage funds as cash-like", () => {
  it("names the arbitrage fund, and moves its whole value into Debt in the legend and headline", () => {
    mount();
    const toggle = screen.getByRole("checkbox", { name: "Treat arbitrage funds as cash-like" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("arbitrage-note")).toHaveTextContent("Applies to HDFC Arbitrage Fund. Entire fund value moves to Debt; Equity Savings is unchanged.");
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Equity70.0%", "Debt25.0%", "Gold5.0%", "Real Estate (REITs and InvITs)0.0%"]);
    expect(screen.getByTestId("largest-asset-class")).toHaveTextContent("Largest asset class: Equity (70.0%)");
    fireEvent.click(toggle);
    expect(legend().getByRole("button", { name: /Equity/ })).toHaveTextContent("78.0%");
  });
  it("says there are none when the household holds no arbitrage fund", () => {
    const data = fb.assetAllocation();
    data.arbitrage_funds = [];
    mount(data);
    expect(screen.getByTestId("arbitrage-note")).toHaveTextContent("No covered Arbitrage Fund holdings for this selection.");
  });
});

describe("the single donut", () => {
  it("draws class arcs without an outer ring", () => {
    mount();
    expect(screen.getAllByTestId(/^inner-/).map(arc => arc.getAttribute("data-testid"))).toEqual(["inner-equity", "inner-debt", "inner-gold", "inner-real_estate"]);
    expect(screen.queryAllByTestId(/^outer-/)).toHaveLength(0);
  });
  it("dims other class arcs on hover and restores them", () => {
    mount();
    fireEvent.mouseEnter(screen.getByTestId("legend-debt"));
    expect(screen.getByTestId("inner-equity")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("inner-debt")).toHaveAttribute("data-dim", "false");
    fireEvent.mouseLeave(screen.getByTestId("legend-debt"));
    expect(screen.getAllByTestId(/^inner-/).every(arc => arc.getAttribute("data-dim") === "false")).toBe(true);
  });
  it("selects a class with the keyboard", () => {
    mount();
    fireEvent.click(screen.getByTestId("inner-gold"));
    fireEvent.keyDown(screen.getByTestId("inner-debt"), { key: "Enter" });
    expect(screen.getByTestId("inner-debt")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("inner-gold")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the drill panel", () => {
  it("opens right under the card titled with the clicked class, keeps the row selected, and scrolls into view", () => {
    mount();
    expect(screen.queryByTestId("drill-panel")).not.toBeInTheDocument();
    fireEvent.click(legend().getByRole("button", { name: /Equity/ }));
    const panel = screen.getByRole("region", { name: "Equity detail" });
    expect(within(panel).getByRole("heading", { name: "Equity" })).toBeInTheDocument();
    expect(within(panel).getByTestId("drill-dot")).toHaveStyle({ backgroundColor: "var(--c1)" });
    expect(legend().getByRole("button", { name: /Equity/ })).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByTestId("legend-equity"));
    expect(legend().getByRole("button", { name: /Equity/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("keeps the equity total and link to the market-cap card without repeating its size breakdown", () => {
    const target = document.createElement("div");
    target.id = "market-cap";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    mount();
    fireEvent.click(legend().getByRole("button", { name: /Equity/ }));
    expect(screen.getByTestId("drill-class-total")).toHaveTextContent("Equity total: ₹33,15,000 · 78.0%");
    fireEvent.click(screen.getByRole("button", { name: "See the stock-level split in Market-Cap Allocation" }));
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });
  it("shows the Debt total and a note when the fund-level breakdown is absent", () => {
    mount();
    fireEvent.click(legend().getByRole("button", { name: /Debt/ }));
    expect(screen.getByRole("region", { name: "Debt detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-class-total")).toHaveTextContent("Debt total: ₹7,22,500 · 17.0%");
    expect(screen.queryByTestId("drill-cap-large")).not.toBeInTheDocument();
    expect(screen.getByTestId("drill-gap-note")).toHaveTextContent("A fund-by-fund breakdown isn't available for this class yet; the look-through produces one total for it.");
  });
  it("keeps the selected class, with its new numbers, when the arbitrage switch changes the figures", () => {
    mount();
    fireEvent.click(legend().getByRole("button", { name: /Equity/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Treat arbitrage funds as cash-like" }));
    expect(screen.getByTestId("drill-class-total")).toHaveTextContent("Equity total: ₹29,75,000 · 70.0%");
  });
});

describe("chart type", () => {
  it("offers Donut and Bar Chart, labelled, and switches to bars with the same numbers and the same selection", () => {
    mount();
    expect(screen.getByRole("radiogroup", { name: "Chart type" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Donut" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(legend().getByRole("button", { name: /Debt/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Bar Chart" }));
    expect(screen.queryByRole("img", { name: "Asset class chart" })).not.toBeInTheDocument();
    const bars = within(screen.getByRole("list", { name: "Look-through asset breakdown" }));
    expect(bars.getAllByRole("button").map(button => button.textContent)).toEqual(["Equity78.0%", "Debt17.0%", "Gold5.0%", "Real Estate (REITs and InvITs)0.0%"]);
    expect(bars.getByRole("button", { name: /Debt/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bar-equity")).toHaveStyle({ width: "78%" });
    expect(screen.getByRole("region", { name: "Debt detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-class-total")).toHaveTextContent("Debt total: ₹7,22,500 · 17.0%");
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    expect(screen.getByTestId("inner-debt")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(legend().getByRole("button", { name: /Equity/ }));
    expectInteractivity(container, 10);
  });
});


function fiveClasses() {
  const data = fb.assetAllocation();
  const classes = [
    { key: "equity", value: "600", percentage: "60", funds: [] },
    { key: "debt", value: "200", percentage: "20", funds: [] },
    { key: "gold", value: "50", percentage: "5", funds: [] },
    { key: "real_estate", value: "100", percentage: "10", funds: [] },
    { key: "others", value: "50", percentage: "5", funds: [{ scheme_id: "fund-other", scheme_name: "Mixed Fund", value: "50", percentage: "100" }] },
  ];
  Object.assign(data.as_disclosed, { classes });
  Object.assign(data.arbitrage_as_cash, { classes: structuredClone(classes) });
  return data;
}

describe("T1.2 five classes", () => {
  it("draws five slices with Others last and grey", () => {
    mount(fiveClasses());
    expect(legend().getAllByRole("button").map(button => button.textContent)).toEqual(["Equity60.0%", "Debt20.0%", "Gold5.0%", "Real Estate (REITs and InvITs)10.0%", "Others5.0%"]);
    expect(screen.getAllByTestId(/^inner-/)).toHaveLength(5);
    expect(screen.getByTestId("inner-others").querySelector("circle")).toHaveAttribute("stroke", "var(--ui-text-muted)");
    expect(screen.getByText("Cash is included under Debt")).toBeInTheDocument();
  });
  it("hides Others at 0 percent", () => {
    const data = fiveClasses();
    Object.assign(data.as_disclosed.classes[4], { value: "0", percentage: "0" });
    mount(data);
    expect(legend().getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByTestId("legend-others")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inner-others")).not.toBeInTheDocument();
  });
  it("clicking Others lists the funds behind it", () => {
    mount(fiveClasses());
    fireEvent.click(legend().getByRole("button", { name: /Others/ }));
    expect(screen.getByRole("region", { name: "Others detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-fund-fund-other")).toHaveTextContent("Mixed Fund");
    expect(screen.getByTestId("drill-fund-fund-other")).toHaveTextContent("₹50 · 100.0% of Others");
  });
  it("no outer cap ring", () => {
    mount(fiveClasses());
    expect(screen.queryAllByTestId(/^outer-/)).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Equity outer breakdown" })).not.toBeInTheDocument();
    fireEvent.click(legend().getByRole("button", { name: /Equity/ }));
    expect(screen.queryAllByTestId(/^drill-cap-/)).toHaveLength(0);
  });
  it("old payload shows updating state", () => {
    const old = fb.assetAllocation();
    old.as_disclosed.classes = old.as_disclosed.classes.slice(0, 3).concat({ key: "cash_like", value: "0", percentage: "0" });
    mount(old);
    expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
    expect(screen.getByRole("heading", { name: "Look-Through Asset Allocation" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Asset class chart" })).not.toBeInTheDocument();
  });
});
