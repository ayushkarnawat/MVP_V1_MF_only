import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { OverlapResponse } from "../types";
import { NormalState } from "./NormalState";

// The kit pie is a stub (jsdom cannot measure a width).
interface PieStubProps { data: { label: string; value: number }[]; children?: ReactNode }
const pie = vi.hoisted(() => ({ props: null as null | PieStubProps }));
vi.mock("@/components/ui/charts", () => ({
  PieChart: (props: PieStubProps) => {
    pie.props = props;
    return <div data-testid="pie-chart">{props.children}</div>;
  },
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const golden = () => fixture<OverlapResponse>("overlap_fund");

function mount(overlap: OverlapResponse = golden(), onCompare = vi.fn(), restoreFocusId: string | null = null) {
  render(<NormalState overlap={overlap} fundName={NAME} onCompare={onCompare} restoreFocusId={restoreFocusId} />);
  return onCompare;
}

describe("NormalState", () => {
  it("shows the heading, the sub line and the five cards in order, no coverage note for a fully covered portfolio", () => {
    mount();
    expect(screen.getByRole("heading", { level: 2, name: "Overlap with Your Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("How much of this fund's holdings are duplicated elsewhere in your portfolio.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual([
      "Overlap Summary", "Common Holdings by Sector", "Common Holdings", "Quick insights", "Top Funds with Overlap",
    ]);
    expect(screen.queryByTestId("overlap-coverage")).toBeNull();
    expect(screen.queryByText(/Our view|Consider Review|recommended alternative/i)).toBeNull();
  });

  it("the summary card is the donut with 18.0% and '3 common stocks out of 12 total holdings', above the distribution rows", () => {
    mount();
    const card = screen.getByRole("region", { name: "Overlap Summary" });
    expect(within(card).getByTestId("overlap-donut-figure")).toHaveTextContent("18.0%");
    expect(within(card).getByTestId("overlap-donut-label")).toHaveTextContent("overlap with your portfolio");
    expect(within(card).getByTestId("overlap-donut-caption")).toHaveTextContent("3 common stocks out of 12 total holdings");
    expect(within(card).getByRole("group", { name: "Overlap distribution" })).toBeInTheDocument();
    expect(pie.props!.data.map(slice => slice.value)).toEqual([18, 82]);
  });

  it("the common holdings table lists every common stock with its weights and the funds that also hold it", () => {
    mount();
    const table = screen.getByRole("table", { name: "Common holdings" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Stock", "Sector", "In this fund", "Of your portfolio", "Also held in"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(r => within(r).getAllByRole("cell").map(cell => cell.textContent))).toEqual([
      ["Golden Stock 3", "Industrials", "7.0%", "7.2%", "Golden Peer 1 Fund"],
      ["Golden Stock 2", "IT", "6.0%", "6.2%", "Golden Peer 1 Fund"],
      ["Golden Stock 1", "Financial Services", "5.0%", "5.3%", "Golden Peer 1 Fund"],
    ]);
  });

  it("a stock held by several other funds names them all, and the table is not capped", () => {
    const overlap = golden();
    overlap.common_holdings = Array.from({ length: 30 }, (_, index) => ({
      isin: `INEX${index}`, name: `Stock ${index}`, sector: "IT", fund_weight: "1.0000", portfolio_weight: "1.0000",
      held_in_funds: [{ scheme_id: "a", scheme_name: "Fund A" }, { scheme_id: "b", scheme_name: "Fund B" }],
    }));
    mount(overlap);
    const rows = within(screen.getByRole("table", { name: "Common holdings" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(30);
    expect(within(rows[0]).getAllByRole("cell")[4]).toHaveTextContent("Fund A, Fund B");
  });

  it("the quick insight is the sentence built from the figures", () => {
    mount();
    expect(screen.getByTestId("quick-insight")).toHaveTextContent(
      "3 of this fund's 12 stocks are also held by other funds in your portfolio, together 18.0% of this fund. The most overlap is in Industrials (7.0%).",
    );
  });

  it("test_row_click: a click on a Top Funds row hands the fund id to onCompare", () => {
    const onCompare = mount();
    fireEvent.click(screen.getByRole("option", { name: /Golden Peer 1 Fund/ }));
    expect(onCompare).toHaveBeenCalledWith("dfb6f3a4-ed3e-5d4c-81e4-7343b0862d60");
  });

  it("thin data: nothing in common reads as empty states, not as broken tables", () => {
    const overlap = golden();
    overlap.overlap_pct = "0.0000";
    overlap.common_stock_count = 0;
    overlap.distribution = { unique_to_fund_count: 12, common_count: 0, unique_to_others_count: 0, unique_to_fund_pct: "100.0000", common_pct: "0.0000", unique_to_others_pct: "0.0000" };
    overlap.common_holdings = [];
    overlap.by_sector = [];
    overlap.top_overlap_funds = [];
    mount(overlap);
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("0.0%");
    expect(screen.getByTestId("overlap-donut-caption")).toHaveTextContent("0 common stocks out of 12 total holdings");
    expect(screen.getByTestId("common-empty")).toBeInTheDocument();
    expect(screen.getByTestId("sector-empty")).toBeInTheDocument();
    expect(screen.getByTestId("top-funds-empty")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByTestId("quick-insight")).toHaveTextContent("None of this fund's 12 stocks are held by your other funds.");
  });

  it("coverage: funds without published holdings are named, and a partly covered portfolio says how much is covered", () => {
    const overlap = golden();
    overlap.coverage = {
      covered_value_pct: "62.5000",
      funds_without_disclosure: [{ scheme_id: "k", scheme_name: "Kappa Fund" }, { scheme_id: "z", scheme_name: "Zeta Fund" }],
    };
    mount(overlap);
    expect(screen.getByTestId("overlap-coverage")).toHaveTextContent(
      "Holdings are not published yet for Kappa Fund, Zeta Fund, so they are not counted. Funds with published holdings cover 62.5% of your portfolio's value.",
    );
  });

  it("coverage: only one of the two causes shows only its sentence", () => {
    const missing = golden();
    missing.coverage = { covered_value_pct: "100.0000", funds_without_disclosure: [{ scheme_id: "k", scheme_name: "Kappa Fund" }] };
    const { unmount } = render(<NormalState overlap={missing} fundName={NAME} onCompare={vi.fn()} />);
    expect(screen.getByTestId("overlap-coverage")).toHaveTextContent("Holdings are not published yet for Kappa Fund, so they are not counted.");
    expect(screen.getByTestId("overlap-coverage")).not.toHaveTextContent("cover");
    unmount();
    const partial = golden();
    partial.coverage = { covered_value_pct: "99.5000", funds_without_disclosure: [] };
    render(<NormalState overlap={partial} fundName={NAME} onCompare={vi.fn()} />);
    expect(screen.getByTestId("overlap-coverage")).toHaveTextContent("Funds with published holdings cover 99.5% of your portfolio's value.");
    expect(screen.getByTestId("overlap-coverage")).not.toHaveTextContent("not published");
  });

  it("passes the row to refocus down to the list", () => {
    mount(golden(), vi.fn(), "dfb6f3a4-ed3e-5d4c-81e4-7343b0862d60");
    expect(screen.getByRole("option", { name: /Golden Peer 1 Fund/ })).toHaveFocus();
  });
});
