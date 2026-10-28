import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { CompositionResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { FundAllocation } from "./FundAllocation";

// jsdom cannot measure a width, so the kit pie is a stub that records the props the card hands to it and
// draws its children (one PieSlice stub per slice). Hover and click are driven through those props.
interface PieStubProps {
  data: { label: string; value: number; color?: string; formattedValue?: string }[];
  size?: number;
  innerRadius?: number;
  hoverOffset?: number;
  hoveredIndex?: number | null;
  onHoverChange?: (index: number | null) => void;
  children?: ReactNode;
}
const pie = vi.hoisted(() => ({ props: null as null | PieStubProps }));
vi.mock("@/components/ui/charts", () => ({
  PieChart: (props: PieStubProps) => {
    pie.props = props;
    return <div data-testid="pie-chart">{props.children}</div>;
  },
  PieSlice: ({ index, hoverOffset }: { index: number; hoverOffset?: number }) => (
    <i data-testid={`pie-slice-${index}`} data-offset={hoverOffset} />
  ),
}));

const section = (over: Partial<FundSection<CompositionResponse>> = {}): FundSection<CompositionResponse> => ({
  status: "ready", data: fixture<CompositionResponse>("composition"), reason: null, error: null, retry: vi.fn(), ...over,
});

function mount(composition: FundSection<CompositionResponse> = section(), currentValue: string | null = "2250.00") {
  return render(<FundAllocation composition={composition} currentValue={currentValue} />);
}
const hover = (index: number | null) => act(() => { pie.props!.onHoverChange!(index); });
const legend = () => screen.getByRole("list", { name: "Allocation breakdown" });
const rowText = () => within(legend()).getAllByRole("button").map(button => button.textContent);
const tab = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "Allocation view" })).getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  pie.props = null;
});

describe("FundAllocation", () => {
  it("test_tabs_switch_data_and_default_market_cap: Market Cap, Sector and Asset Type; Market Cap is pressed first and each tab swaps the data", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Fund Allocation" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Allocation view" });
    expect(within(group).getAllByRole("button").map(b => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Market Cap", "true"], ["Sector", "false"], ["Asset Type", "false"],
    ]);
    expect(pie.props!.data.map(d => d.label)).toEqual(["Large Cap", "Mid Cap", "Small Cap"]);
    // The golden splits the classified equity into three equal thirds (33.3333 each).
    expect(pie.props!.data.map(d => d.value)).toEqual([33.3333, 33.3333, 33.3333]);
    tab("Sector");
    expect(screen.getByRole("button", { name: "Sector" })).toHaveAttribute("aria-pressed", "true");
    expect(pie.props!.data.map(d => d.label)).toEqual(["Industrials", "IT", "Healthcare", "Financial Services", "Unclassified"]);
    expect(pie.props!.data.map(d => d.value)).toEqual([21, 18, 16, 15, 8]);
    tab("Asset Type");
    expect(pie.props!.data.map(d => d.label)).toEqual(["Equity", "Debt", "Cash and equivalents"]);
    expect(pie.props!.data.map(d => d.value)).toEqual([78, 12, 4]);
    tab("Market Cap");
    expect(pie.props!.data.map(d => d.label)).toEqual(["Large Cap", "Mid Cap", "Small Cap"]);
  });

  it("test_market_cap_has_three_slices_and_footnote_with_unclassified_share: three slices and legend rows, no Other slice, and the footnote names the share that is not shown", () => {
    mount();
    expect(screen.getAllByTestId(/^pie-slice-/)).toHaveLength(3);
    expect(rowText()).toEqual(["Large Cap33.3%", "Mid Cap33.3%", "Small Cap33.3%"]);
    expect(rowText().some(text => /other/i.test(text ?? ""))).toBe(false);
    expect(screen.getByTestId("alloc-note")).toHaveTextContent(
      "Share of the classified equity part. Not shown: 16.0% of the fund (cash, debt, unlisted). Disclosure as of 30 Sep 2026."
    );
    for (const color of pie.props!.data.map(d => d.color)) expect(color).toMatch(/^var\(--c\d\)$/);
  });

  it("the footnote leaves out the 'not shown' part when everything is classified, and the other tabs have their own notes", () => {
    const data = fixture<CompositionResponse>("composition");
    data.unclassified_pct = "0.0000";
    mount(section({ data }));
    expect(screen.getByTestId("alloc-note")).toHaveTextContent("Share of the classified equity part. Disclosure as of 30 Sep 2026.");
    expect(screen.getByTestId("alloc-note").textContent).not.toContain("Not shown");
    tab("Sector");
    expect(screen.getByTestId("alloc-note")).toHaveTextContent("Sector from the fund's disclosure, as of 30 Sep 2026.");
    tab("Asset Type");
    expect(screen.getByTestId("alloc-note")).toHaveTextContent("Share of the fund's portfolio, as of 30 Sep 2026.");
  });

  it("a slice with a zero share is not drawn and has no legend row", () => {
    const data = fixture<CompositionResponse>("composition");
    data.allocation.market_cap = [{ label: "Large", pct: "100.0000" }, { label: "Mid", pct: "0.0000" }, { label: "Small", pct: "0.0000" }];
    mount(section({ data }));
    expect(rowText()).toEqual(["Large Cap100.0%"]);
    expect(screen.getAllByTestId(/^pie-slice-/)).toHaveLength(1);
  });

  it("a tab with no slices says so", () => {
    const data = fixture<CompositionResponse>("composition");
    data.allocation.asset_type = [];
    mount(section({ data }));
    tab("Asset Type");
    expect(screen.getByTestId("alloc-empty")).toHaveTextContent("No allocation data for this view.");
  });

  it("test_centre_shows_current_value_compact: the household's value in the middle, in lakh and crore form when large", () => {
    const { unmount } = mount();
    expect(screen.getByTestId("alloc-centre-value")).toHaveTextContent("₹2,250");
    expect(screen.getByTestId("alloc-centre-label")).toHaveTextContent("Current value");
    unmount();
    mount(section(), "1234567.00");
    expect(screen.getByTestId("alloc-centre-value")).toHaveTextContent("₹12.35 L");
  });

  it("with no personal value (a member who does not hold the fund) the centre says 100% of the fund", () => {
    mount(section(), null);
    expect(screen.getByTestId("alloc-centre-value")).toHaveTextContent("100%");
    expect(screen.getByTestId("alloc-centre-label")).toHaveTextContent("of the fund");
  });

  it("test_slice_hover_sets_lift_and_dims_others: the pie lifts a hovered slice by 7, the legend row lights up, the others dim and the centre names the slice", () => {
    mount();
    expect(pie.props!.hoverOffset).toBe(7);
    expect(pie.props!.hoveredIndex).toBeNull();
    for (const slice of screen.getAllByTestId(/^pie-slice-/)) expect(slice).toHaveAttribute("data-offset", "7");
    hover(1);
    expect(pie.props!.hoveredIndex).toBe(1);
    expect(screen.getByTestId("alloc-row-1")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("alloc-row-0")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("alloc-row-0").className).toContain("opacity-60");
    expect(screen.getByTestId("alloc-row-1").className).not.toContain("opacity-60");
    expect(screen.getByTestId("alloc-centre-value")).toHaveTextContent("33.3%");
    expect(screen.getByTestId("alloc-centre-label")).toHaveTextContent("Mid Cap");
    hover(null);
    expect(pie.props!.hoveredIndex).toBeNull();
    expect(screen.getByTestId("alloc-row-0").className).not.toContain("opacity-60");
    expect(screen.getByTestId("alloc-centre-value")).toHaveTextContent("₹2,250");
  });

  it("hovering or focusing a legend row lifts its slice and leaving clears it", () => {
    mount();
    fireEvent.mouseEnter(screen.getByTestId("alloc-row-2"));
    expect(pie.props!.hoveredIndex).toBe(2);
    fireEvent.mouseLeave(screen.getByTestId("alloc-row-2"));
    expect(pie.props!.hoveredIndex).toBeNull();
    fireEvent.focus(screen.getByTestId("alloc-row-0"));
    expect(pie.props!.hoveredIndex).toBe(0);
    fireEvent.blur(screen.getByTestId("alloc-row-0"));
    expect(pie.props!.hoveredIndex).toBeNull();
  });

  it("changing the tab clears the hover", () => {
    mount();
    hover(2);
    tab("Sector");
    expect(pie.props!.hoveredIndex).toBeNull();
  });

  it("test_slice_click_opens_slice_popup: a click on the chart while a slice is under the pointer opens that slice's dialog; a click on empty chart does nothing", () => {
    mount();
    fireEvent.click(screen.getByTestId("alloc-chart"));
    expect(screen.queryByRole("dialog")).toBeNull();
    hover(0);
    fireEvent.click(screen.getByTestId("alloc-chart"));
    const dialog = screen.getByRole("dialog", { name: "Large Cap (33.3%)" });
    expect(within(dialog).getByText("Share of classified equity", { selector: "dt" }).nextElementSibling).toHaveTextContent("33.3%");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a legend row is a real button that opens the same dialog, for the keyboard too", () => {
    mount();
    fireEvent.click(screen.getByTestId("alloc-row-1"));
    expect(screen.getByRole("dialog", { name: "Mid Cap (33.3%)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    tab("Asset Type");
    fireEvent.click(screen.getByTestId("alloc-row-2"));
    const dialog = screen.getByRole("dialog", { name: "Cash and equivalents (4.0%)" });
    expect(within(dialog).getByText("Share of the fund", { selector: "dt" })).toBeInTheDocument();
  });

  it("a sector slice lists the top-10 holdings in that sector, or says there are none", () => {
    // The golden's sectors, in order: Industrials 21, IT 18, Healthcare 16, Financial Services 15, Unclassified 8.
    // A sixth, hand-added sector has none of the top-10 stocks, to cover the empty case.
    const data = fixture<CompositionResponse>("composition");
    data.allocation.sector.push({ label: "Utilities", pct: "2.0000" });
    mount(section({ data }));
    tab("Sector");
    fireEvent.click(screen.getByTestId("alloc-row-0"));
    let dialog = screen.getByRole("dialog", { name: "Industrials (21.0%)" });
    expect(within(dialog).getByText("Top 10 holdings in this sector")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Golden Stock 37.0%", "Golden Stock 77.0%", "Golden Stock 117.0%"]);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.click(screen.getByTestId("alloc-row-4"));
    dialog = screen.getByRole("dialog", { name: "Unclassified (8.0%)" });
    expect(within(dialog).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Golden Stock 128.0%"]);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.click(screen.getByTestId("alloc-row-5"));
    dialog = screen.getByRole("dialog", { name: "Utilities (2.0%)" });
    expect(within(dialog).getByTestId("slice-none")).toHaveTextContent("None of the top 10 holdings is in this sector.");
  });

  it("shows a loading status, its reason, or an error with Retry, and keeps the heading and tabs", () => {
    const { unmount } = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Allocation view" })).toBeInTheDocument();
    unmount();
    const second = mount(section({ status: "unavailable", data: null, reason: "no_disclosure" }));
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("Holdings not available yet for this fund house.");
    second.unmount();
    const retry = vi.fn();
    mount(section({ status: "error", data: null, error: new Error("down"), retry }));
    expect(screen.getByText("Couldn't load allocation.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pie-chart")).toBeNull();
  });
});
