import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import { expectInteractivity, failedLoad, loaded, loadingLoad } from "../testing";
import type { AnalyticsAllocationSummary, HoldingRow, Load } from "../types";
import { CategoryAmcCard } from "./CategoryAmcCard";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function mount(opts: { data?: AnalyticsAllocationSummary | null; state?: "loading" | "ready" | "failed" | "error"; holdings?: Load<HoldingRow[]>; onRetry?: () => void } = {}) {
  return render(
    <CategoryAmcCard state={opts.state ?? "ready"} data={opts.data === undefined ? fb.analyticsAllocation() : opts.data} onRetry={opts.onRetry ?? vi.fn()} holdings={opts.holdings ?? loaded(fx.holdings())} />,
  );
}
const legend = (label = "Category breakdown") => within(screen.getByRole("list", { name: label }));
const texts = (label?: string) => legend(label).getAllByRole("button").map(button => button.textContent);

describe("content", () => {
  it("opens on By Category, largest first, with the heading, the info mark, the donut and the one-place percentages", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Portfolio Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Asset distribution across SEBI categories and fund houses (AMCs)." })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "By Category" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "By AMC" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("button", { name: "Largest first" })).toHaveAttribute("aria-pressed", "true");
    expect(texts()).toEqual(["Flexi Cap Fund54.2%", "Mid Cap Fund28.2%", "Large Cap Fund17.6%"]);
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
  });
  it("sorts smallest first", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Smallest first" }));
    expect(screen.getByRole("button", { name: "Smallest first" })).toHaveAttribute("aria-pressed", "true");
    expect(texts()).toEqual(["Large Cap Fund17.6%", "Mid Cap Fund28.2%", "Flexi Cap Fund54.2%"]);
  });
  it("switches to By AMC with that breakdown's list", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "By AMC" }));
    expect(screen.getByRole("tab", { name: "By AMC" })).toHaveAttribute("aria-selected", "true");
    expect(texts("AMC breakdown")).toEqual(["Kotak Mahindra Mutual Fund33.1%", "HDFC Mutual Fund28.2%", "JM Financial Mutual Fund21.1%", "SBI Mutual Fund17.6%"]);
    expect(screen.queryByRole("list", { name: "Category breakdown" })).not.toBeInTheDocument();
  });
  it("says so when there is nothing to show", () => {
    const data = fb.analyticsAllocation();
    data.by_category = [];
    mount({ data });
    expect(screen.getByText("No allocation data available for this selection")).toBeInTheDocument();
    expect(screen.getByText("Import a CAS statement with valid mutual fund holdings to visualize category and AMC breakdown.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portfolio Allocation" })).toBeInTheDocument();
  });
  it("keeps the heading in the loading state and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const { unmount } = mount({ data: null, state: "loading" });
    expect(screen.getByRole("status", { name: "Loading Portfolio Allocation" })).toBeInTheDocument();
    unmount();
    mount({ data: null, state: "failed", onRetry: retry });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("the drill panel", () => {
  it("opens right under the card titled with the clicked slice and its colour, lists its funds largest first with their share, marks the largest and scrolls into view", () => {
    mount();
    expect(screen.queryByTestId("drill-panel")).not.toBeInTheDocument();
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    const panel = screen.getByRole("region", { name: "Flexi Cap Fund — contributing funds detail" });
    expect(within(panel).getByRole("heading", { name: "Flexi Cap Fund — contributing funds" })).toBeInTheDocument();
    expect(within(panel).getByTestId("drill-dot")).toHaveStyle({ backgroundColor: "var(--c1)" });
    const funds = within(panel).getAllByRole("listitem");
    expect(funds.map(item => item.getAttribute("data-testid"))).toEqual(["drill-fund-S-KOTAK", "drill-fund-S-JM"]);
    expect(funds[0]).toHaveTextContent("Kotak Multi Cap Fund");
    expect(funds[0]).toHaveTextContent("₹15,40,000 · 61.1%");
    expect(funds[1]).toHaveTextContent("₹9,80,000 · 38.9%");
    expect(funds[0]).toHaveAttribute("data-largest", "true");
    expect(funds[1]).toHaveAttribute("data-largest", "false");
    expect(within(funds[0]).getByText("Largest")).toBeInTheDocument();
    expect(screen.getByTestId("drill-bar-S-KOTAK")).toHaveStyle({ width: "61.1111%" });
    expect(screen.getByTestId("drill-caption")).toHaveTextContent("Largest 2 of 2 funds in this slice.");
    expect(legend().getByRole("button", { name: /Flexi Cap Fund/ })).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByTestId("legend-flexi-cap-fund"));
    expect(legend().getByRole("button", { name: /Flexi Cap Fund/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("selects from a donut slice too, and moves the panel when another slice is clicked", () => {
    mount();
    fireEvent.click(screen.getByTestId("slice-mid-cap-fund"));
    expect(screen.getByRole("region", { name: "Mid Cap Fund — contributing funds detail" })).toBeInTheDocument();
    fireEvent.click(legend().getByRole("button", { name: /Large Cap Fund/ }));
    expect(screen.queryByRole("region", { name: "Mid Cap Fund — contributing funds detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Large Cap Fund — contributing funds detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-fund-S-SBI")).toHaveTextContent("₹8,19,340 · 100.0%");
  });
  it("lists the funds of an AMC", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "By AMC" }));
    fireEvent.click(legend("AMC breakdown").getByRole("button", { name: /HDFC Mutual Fund/ }));
    expect(screen.getByRole("region", { name: "HDFC Mutual Fund — contributing funds detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-fund-S-HDFC")).toHaveTextContent("HDFC Mid-Cap Opportunities Fund");
    expect(screen.getByTestId("drill-fund-S-HDFC")).toHaveTextContent("₹13,10,000 · 100.0%");
  });
  it("closes the panel when the tab changes", () => {
    mount();
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    fireEvent.click(screen.getByRole("tab", { name: "By AMC" }));
    expect(screen.queryByTestId("drill-panel")).not.toBeInTheDocument();
  });
  it("keeps the panel when only the sort order changes", () => {
    mount();
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    fireEvent.click(screen.getByRole("button", { name: "Smallest first" }));
    expect(screen.getByRole("region", { name: "Flexi Cap Fund — contributing funds detail" })).toBeInTheDocument();
  });
  it("shows the five largest funds and says how many there are in all", () => {
    const rows: HoldingRow[] = Array.from({ length: 7 }, (_, i) => ({ ...fx.holdings()[0], scheme_id: `S-X${i}`, scheme_name: `Fund ${i}`, current_value: `${(7 - i) * 100000}.00`, sebi_category: "Flexi Cap Fund" }));
    mount({ holdings: loaded(rows) });
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    expect(within(screen.getByRole("list", { name: "Contributing funds" })).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByTestId("drill-caption")).toHaveTextContent("Largest 5 of 7 funds in this slice.");
  });
  it("leaves out funds with no price, and says so when a slice has none priced", () => {
    const data = fb.analyticsAllocation();
    data.by_amc.push({ label: "Axis Mutual Fund", current_value: "0.00", percentage: "0.00" });
    mount({ data });
    fireEvent.click(screen.getByRole("tab", { name: "By AMC" }));
    fireEvent.click(legend("AMC breakdown").getByRole("button", { name: /Axis Mutual Fund/ }));
    expect(screen.getByText("No priced funds in this slice.")).toBeInTheDocument();
  });
  it("shows a loading status while the funds load, and an error with Retry when they fail", () => {
    const failing = failedLoad<HoldingRow[]>();
    const { unmount } = mount({ holdings: loadingLoad<HoldingRow[]>() });
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    expect(screen.getByRole("status", { name: "Loading funds" })).toBeInTheDocument();
    unmount();
    mount({ holdings: failing });
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    expect(screen.getByText("The funds in this slice couldn't be loaded.")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("drill-panel")).getByRole("button", { name: "Retry" }));
    expect(failing.retry).toHaveBeenCalledTimes(1);
  });
});

describe("chart type", () => {
  it("offers Donut and Bar Chart and keeps the selected slice, the sort order and the panel when switching", () => {
    mount();
    expect(screen.getByRole("radiogroup", { name: "Chart type" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Donut" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Smallest first" }));
    fireEvent.click(legend().getByRole("button", { name: /Mid Cap Fund/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Bar Chart" }));
    expect(screen.queryByRole("img", { name: "SEBI category chart" })).not.toBeInTheDocument();
    expect(texts()).toEqual(["Large Cap Fund17.6%", "Mid Cap Fund28.2%", "Flexi Cap Fund54.2%"]);
    expect(legend().getByRole("button", { name: /Mid Cap Fund/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bar-flexi-cap-fund")).toHaveStyle({ width: "54.20%" });
    expect(screen.getByRole("region", { name: "Mid Cap Fund — contributing funds detail" })).toBeInTheDocument();
    expect(screen.getByTestId("drill-fund-S-HDFC")).toHaveTextContent("₹13,10,000");
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    expect(screen.getByTestId("slice-mid-cap-fund")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(legend().getByRole("button", { name: /Flexi Cap Fund/ }));
    expectInteractivity(container, 10);
  });
});
