import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { BenchmarksResponse, WealthSeriesResponse } from "../types";
import { WealthCard, type WealthCardProps } from "./WealthCard";

// The kit chart is replaced by a stub that records its props: jsdom cannot measure a width, so the real
// chart would draw nothing. This checks exactly what the card hands to the chart.
interface StubProps {
  series: { key: string; color: string; area?: boolean; values: number[] }[];
  secondSeries?: { name: string; color: string; values: number[] };
  labels: (index: number) => string;
  tooltipLabel: (index: number) => string;
  formatValue: (value: number) => string;
  formatPercent: (value: number) => string;
  ariaLabel: string;
}
const chart = vi.hoisted(() => ({ props: null as null | StubProps }));
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: (props: StubProps) => {
    chart.props = props;
    return <div data-testid="line-chart" />;
  },
}));

const monthly = () => fixture<WealthSeriesResponse>("wealth_1m_family_benchmark");
const options = () => fixture<BenchmarksResponse>("benchmarks_family").options;

function setup(overrides: Partial<WealthCardProps> = {}) {
  const handlers = {
    onPeriodChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onBenchmarkChange: vi.fn(),
    onToggleHidden: vi.fn(),
    onRetry: vi.fn(),
    onImport: vi.fn(),
  };
  const props: WealthCardProps = {
    status: "data",
    data: monthly(),
    scope: "aggregate",
    memberName: null,
    period: "1M",
    customRange: { from: null, to: null },
    today: "2026-10-23",
    benchmarkOptions: options(),
    benchmark: "nifty_50",
    hidden: false,
    ...handlers,
    ...overrides,
  };
  const view = render(<WealthCard {...props} />);
  return { ...view, handlers, props, rerenderWith: (next: Partial<WealthCardProps>) => view.rerender(<WealthCard {...props} {...next} />) };
}

beforeEach(() => { chart.props = null; });

describe("WealthCard: states", () => {
  it("shows a loading placeholder and none of the controls", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading wealth graph" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByTestId("wealth-total")).toBeNull();
  });

  it("shows the caption, a message and a retry button on an error, and hides the headline", () => {
    const { handlers } = setup({ status: "error", data: null });
    expect(screen.getByTestId("wealth-caption").textContent).toBe("Your family's wealth");
    expect(screen.getByText("Could not load your wealth graph.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("wealth-total")).toBeNull();
    expect(chart.props).toBeNull();
  });

  it("asks for an import when there are no investments at all", () => {
    const data = { ...fixture<WealthSeriesResponse>("wealth_custom_empty_range"), period: "1M" as const };
    const { handlers } = setup({ data });
    expect(screen.getByText("No investments yet.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import statement" }));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
  });

  it("says so, and keeps the period buttons, when a custom range has no investments", () => {
    const data = fixture<WealthSeriesResponse>("wealth_custom_empty_range");
    setup({ data, period: "custom", customRange: { from: "2016-10-23", to: "2016-12-31" } });
    expect(screen.getByText("No investments in this range.")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import statement" })).toBeNull();
  });
});

describe("WealthCard: the headline", () => {
  it("names the family and shows the value, the change and the period label", () => {
    setup();
    expect(screen.getByTestId("wealth-caption").textContent).toBe("Your family's wealth");
    expect(screen.getByTestId("wealth-total").textContent).toBe("₹5,212");
    expect(screen.getByTestId("change-badge").textContent).toBe("▲ +₹116 (+2.28%)");
    expect(screen.getByText("Portfolio change this month")).toBeInTheDocument();
  });

  it("names the member in a member's view", () => {
    setup({ scope: "member", memberName: "Dev Rao" });
    expect(screen.getByTestId("wealth-caption").textContent).toBe("Dev Rao's wealth");
  });

  it("uses the period's label for the change line", () => {
    setup({ data: fixture<WealthSeriesResponse>("wealth_1d_family"), period: "1D", benchmark: null });
    expect(screen.getByText("Portfolio change today")).toBeInTheDocument();
    expect(screen.getByTestId("change-badge").textContent).toBe("▲ +₹12 (+0.23%)");
  });

  it("offers the calculation explainer only when asked to", () => {
    const first = setup();
    expect(screen.queryByRole("button", { name: "How is this calculated?" })).toBeNull();
    first.unmount();
    const onInfo = vi.fn();
    setup({ onInfo });
    fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));
    expect(onInfo).toHaveBeenCalledTimes(1);
  });

  it("hides the value and the change when values are hidden, keeps the benchmark line, and says 'Show values'", () => {
    const { handlers } = setup({ hidden: true });
    expect(screen.getByTestId("wealth-total").textContent).toBe("••••••");
    expect(screen.getByTestId("change-badge").textContent).toBe("••••••");
    expect(screen.getByTestId("benchmark-line").textContent).toContain("Nifty 50");
    fireEvent.click(screen.getByRole("button", { name: "Show values" }));
    expect(handlers.onToggleHidden).toHaveBeenCalledTimes(1);
    expect(chart.props?.formatValue(5212)).toBe("••••••");
  });

  it("says 'Hide values' while showing", () => {
    setup();
    expect(screen.getByRole("button", { name: "Hide values" })).toBeInTheDocument();
  });

  it("flags partial data with the missing funds", () => {
    setup({ data: fixture<WealthSeriesResponse>("wealth_partial") });
    expect(screen.getByRole("note").getAttribute("title")).toBe("Missing: Dev Gold Fund");
  });

  it("shows no partial badge when nothing is missing", () => {
    setup();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("WealthCard: the controls", () => {
  it("lists the benchmarks, selects the current one and reports a change", () => {
    const { handlers } = setup();
    const select = screen.getByRole("combobox", { name: "Benchmark" }) as HTMLSelectElement;
    expect(select.querySelectorAll("option")).toHaveLength(5);
    expect(select.value).toBe("nifty_50");
    fireEvent.change(select, { target: { value: "nifty_500" } });
    expect(handlers.onBenchmarkChange).toHaveBeenCalledWith("nifty_500");
  });

  it("shows the period buttons with the current one checked and reports a change", () => {
    const { handlers } = setup();
    expect(screen.getByRole("radio", { name: "1M" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
    expect(handlers.onPeriodChange).toHaveBeenCalledWith("1Y");
  });

  it("says the change excludes new money, except for a custom range", () => {
    const first = setup();
    expect(screen.getByText("Change excludes new money")).toBeInTheDocument();
    first.unmount();
    setup({ period: "custom" });
    expect(screen.queryByText("Change excludes new money")).toBeNull();
  });
});

describe("WealthCard: the custom range", () => {
  it("opens the calendar when Custom is chosen", () => {
    const { handlers } = setup();
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(handlers.onPeriodChange).toHaveBeenCalledWith("custom");
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
  });

  it("shows the chosen range on the Custom button and on the right, and reopens the calendar from there", () => {
    setup({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
    expect(screen.getByRole("radio", { name: "05 Oct – 12 Oct" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
  });

  it("closes the calendar on Escape and returns focus to Choose dates", () => {
    setup({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
    const choose = screen.getByRole("button", { name: "Choose dates" });
    fireEvent.click(choose);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Previous month" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    expect(choose).toHaveFocus();
  });

  it("keeps the calendar open after the first click and closes it when the range is complete", () => {
    const { handlers } = setup({ period: "custom", customRange: { from: "2026-10-05", to: null } });
    fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
    fireEvent.click(screen.getByRole("button", { name: "12 October 2026" }));
    expect(handlers.onCustomRangeChange).toHaveBeenCalledWith({ from: "2026-10-05", to: "2026-10-12" });
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
  });

  it("does not close the calendar on a click that only sets the start", () => {
    const { handlers } = setup({ period: "custom", customRange: { from: null, to: null } });
    fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
    fireEvent.click(screen.getByRole("button", { name: "5 October 2026" }));
    expect(handlers.onCustomRangeChange).toHaveBeenCalledWith({ from: "2026-10-05", to: null });
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
  });

  it("closes the calendar when another period is chosen", () => {
    const { rerenderWith } = setup({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    rerenderWith({ period: "1M" });
    expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
  });

  it("limits the calendar to the data's own date (today) and ten years back", () => {
    setup({ period: "custom", customRange: { from: "2026-10-05", to: null } });
    fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
    expect(screen.getByRole("button", { name: "24 October 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "23 October 2026" })).toBeEnabled();
  });
});

describe("WealthCard: what the chart is given", () => {
  it("draws the portfolio as a filled line of the series' values, with day-month labels", () => {
    setup();
    const props = chart.props!;
    const data = monthly();
    expect(props.series).toHaveLength(1);
    expect(props.series[0].key).toBe("value");
    expect(props.series[0].color).toBe("var(--c1)");
    expect(props.series[0].area).toBe(true);
    expect(props.series[0].values).toHaveLength(31);
    expect(props.series[0].values[0]).toBe(5095.6);
    expect(props.series[0].values[30]).toBe(Number(data.points[30].value));
    expect(props.labels(0)).toBe("23 Sep");
    expect(props.tooltipLabel(0)).toBe("23 Sep 2026");
    expect(props.ariaLabel).toBe("Portfolio value over time");
  });

  it("draws the benchmark on the right axis when it covers the same days", () => {
    setup();
    const second = chart.props!.secondSeries!;
    expect(second.name).toBe("Nifty 50");
    expect(second.color).toBe("var(--home-bench)");
    expect(second.values).toHaveLength(31);
    expect(second.values[0]).toBe(0);
    expect(second.values[1]).toBe(0.0098);
  });

  it("formats axis values as rupees and percentages without floating point formatting", () => {
    setup();
    const props = chart.props!;
    expect(props.formatValue(5212)).toBe("₹5,212");
    expect(props.formatValue(5211.6)).toBe("₹5,212");
    expect(props.formatValue(21347320)).toBe("₹2.13 Cr");
    expect(props.formatValue(-1500)).toBe("-₹1,500");
    expect(props.formatPercent(0.2145)).toBe("+0.2%");
    expect(props.formatPercent(-1.25)).toBe("-1.3%");
  });

  it("leaves the benchmark off the chart when its history starts after the period (clipped) and says so", () => {
    setup({
      data: fixture<WealthSeriesResponse>("wealth_1y_member_clipped"), scope: "member", memberName: "Dev Rao",
      period: "1Y", benchmark: "nifty_smallcap_250",
    });
    expect(chart.props!.secondSeries).toBeUndefined();
    expect(screen.getByTestId("benchmark-line").textContent).toContain("Nifty Smallcap 250 +0.76% since 01 Sep");
    expect(screen.getByTestId("wealth-note").textContent).toContain("Benchmark history starts on 01 Sep 2026.");
  });

  it("says when the benchmark has no data for the period and draws no benchmark", () => {
    const data = monthly();
    data.benchmark = { index: "nifty_50", label: "Nifty 50", available: false, pct: null, effective_start: null, clipped: false, points: [] };
    setup({ data });
    expect(screen.queryByTestId("benchmark-line")).toBeNull();
    expect(chart.props!.secondSeries).toBeUndefined();
    expect(screen.getByTestId("wealth-note").textContent).toContain("Benchmark data is not available for this period.");
  });

  it("shows no benchmark line and no benchmark series when none was requested", () => {
    setup({ data: fixture<WealthSeriesResponse>("wealth_1d_family"), period: "1D", benchmark: null });
    expect(screen.queryByTestId("benchmark-line")).toBeNull();
    expect(chart.props!.secondSeries).toBeUndefined();
  });

  it("explains the two NAV days of a 1D view under the chart", () => {
    setup({ data: fixture<WealthSeriesResponse>("wealth_1d_family"), period: "1D", benchmark: null });
    expect(screen.getByTestId("wealth-note").textContent).toContain("1D compares two NAV days (22 Oct and 23 Oct).");
  });

  it("still draws a one-point series", () => {
    const data = fixture<WealthSeriesResponse>("wealth_1d_family");
    data.points = data.points.slice(0, 1);
    setup({ data, period: "1D", benchmark: null });
    expect(chart.props!.series[0].values).toHaveLength(1);
  });

  it("has the chart inside the card, after the headline", () => {
    const { container } = setup();
    const card = container.firstElementChild as HTMLElement;
    expect(within(card).getByTestId("line-chart")).toBeInTheDocument();
  });
});
