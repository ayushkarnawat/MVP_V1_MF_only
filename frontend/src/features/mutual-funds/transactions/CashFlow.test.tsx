import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { diffDecimalStrings } from "../../../lib/decimal";
import { formatRupees } from "../../../lib/format";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { Granularity, LedgerFilter } from "./transactionsLogic";
import { CashFlowBars } from "./CashFlowBars";
import { CashFlowStrip } from "./CashFlowStrip";

describe("CashFlowStrip", () => {
  const mount = (filter: LedgerFilter = "all", onFilter = vi.fn()) => render(<CashFlowStrip data={fb.investmentWithdrawal()} filter={filter} onFilter={onFilter} />);

  it("shows four tiles with their rupee totals", () => {
    mount();
    expect(screen.getByTestId("tile-invested")).toHaveTextContent("Total invested");
    expect(screen.getByTestId("tile-invested-value")).toHaveTextContent("₹9,41,895");
    expect(screen.getByTestId("tile-withdrawn")).toHaveTextContent("Total withdrawn");
    expect(screen.getByTestId("tile-withdrawn-value")).toHaveTextContent("₹23,500");
    expect(screen.getByTestId("tile-switched")).toHaveTextContent("Net switched");
    expect(screen.getByTestId("tile-switched-value")).toHaveTextContent("₹0");
    expect(screen.getByTestId("tile-net")).toHaveTextContent("Net invested");
    expect(screen.getByTestId("tile-net-value")).toHaveTextContent("₹9,18,395");
  });
  it("makes net invested equal to invested minus withdrawn", () => {
    mount();
    const data = fb.investmentWithdrawal();
    expect(screen.getByTestId("tile-net-value").textContent).toBe(formatRupees(diffDecimalStrings(data.total_invested, data.total_withdrawn)));
  });
  it("applies the tile's own type filter when Invested, Withdrawn or Switched is clicked", () => {
    const onFilter = vi.fn();
    mount("all", onFilter);
    fireEvent.click(screen.getByTestId("tile-invested"));
    fireEvent.click(screen.getByTestId("tile-withdrawn"));
    fireEvent.click(screen.getByTestId("tile-switched"));
    expect(onFilter.mock.calls.map(call => call[0])).toEqual(["purchases", "redemptions", "switches"]);
  });
  it("shows the tile of the current filter as selected, and none for All", () => {
    const { unmount } = mount("redemptions");
    expect(screen.getByTestId("tile-withdrawn")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tile-invested")).toHaveAttribute("aria-pressed", "false");
    unmount();
    mount("all");
    expect(["tile-invested", "tile-withdrawn", "tile-switched"].map(id => screen.getByTestId(id).getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
  });
  it("gives net invested a tooltip instead of a click: it has no matching type", () => {
    const onFilter = vi.fn();
    mount("all", onFilter);
    const net = screen.getByTestId("tile-net");
    expect(net).toHaveAttribute("data-tooltip", "Net invested is invested minus withdrawn. It has no matching transaction type, so it cannot filter the list.");
    expect(net).toHaveAttribute("title", "Net invested is invested minus withdrawn. It has no matching transaction type, so it cannot filter the list.");
    expect(net.tagName).not.toBe("BUTTON");
    fireEvent.click(net);
    expect(onFilter).not.toHaveBeenCalled();
  });
  it("marks every control with its effect and its state", () => {
    const { container } = mount("purchases");
    expectInteractivity(container, 3);
  });
});

describe("CashFlowBars", () => {
  const data = fb.investmentWithdrawal();
  function mount(opts: { granularity?: Granularity; selected?: string | null; onSelect?: (p: string) => void; onGranularity?: (g: Granularity) => void } = {}) {
    const granularity = opts.granularity ?? "monthly";
    return render(
      <CashFlowBars
        buckets={granularity === "monthly" ? data.monthly : data.yearly}
        granularity={granularity}
        onGranularity={opts.onGranularity ?? vi.fn()}
        selectedPeriod={opts.selected ?? null}
        onSelect={opts.onSelect ?? vi.fn()}
      />,
    );
  }

  it("draws one clickable column per month with its short label and two bars", () => {
    mount();
    const columns = within(screen.getByRole("group", { name: "Cash flow by period" })).getAllByRole("button");
    expect(columns).toHaveLength(12);
    expect(columns[0]).toHaveTextContent("Nov ’25");
    expect(columns[11]).toHaveTextContent("Oct ’26");
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-label", "March 2026: invested ₹50,575, withdrawn and switched out ₹23,500");
    expect(screen.getByTestId("bar-invested-2025-12")).toHaveStyle({ height: "100%" });
    expect(screen.getByTestId("bar-invested-2026-01")).toHaveStyle({ height: "33.59%" });
    expect(screen.getByTestId("bar-out-2026-06")).toHaveStyle({ height: "33.21%" });
    expect(screen.getByTestId("bar-out-2026-01")).toHaveStyle({ height: "0%" });
  });
  it("explains the click, names the two bars in the legend and offers Monthly and Yearly with Monthly pressed", () => {
    mount();
    expect(screen.getByText("Click any period to see its dated, per-fund transactions below.")).toBeInTheDocument();
    expect(screen.getByText("Invested")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn + switched out")).toBeInTheDocument();
    const period = within(screen.getByRole("group", { name: "Period" }));
    expect(period.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(period.getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "false");
  });
  it("reports the clicked period and shows the selected one with a persistent state", () => {
    const onSelect = vi.fn();
    const { unmount } = mount({ onSelect });
    fireEvent.click(screen.getByTestId("period-2026-03"));
    expect(onSelect).toHaveBeenCalledWith("2026-03");
    unmount();
    mount({ selected: "2026-03" });
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("data-selected", "true");
    fireEvent.mouseLeave(screen.getByTestId("period-2026-03"));
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("period-2026-04")).toHaveAttribute("aria-pressed", "false");
  });
  it("reports the granularity pill that was clicked", () => {
    const onGranularity = vi.fn();
    mount({ onGranularity });
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(onGranularity).toHaveBeenCalledWith("yearly");
  });
  it("draws a column per year in the yearly view", () => {
    mount({ granularity: "yearly" });
    expect(within(screen.getByRole("group", { name: "Cash flow by period" })).getAllByRole("button").map(button => button.textContent)).toEqual(["2025", "2026"]);
    expect(screen.getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "true");
  });
  it("marks every control with its effect and its state", () => {
    const { container } = mount({ selected: "2026-03" });
    expectInteractivity(container, 14);
  });
});
