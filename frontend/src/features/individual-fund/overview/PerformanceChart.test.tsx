import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { CategorySeriesResponse, PerformancePeriod, PerformanceResponse, Unavailable } from "../types";
import { PerformanceChart } from "./PerformanceChart";

// The kit chart is replaced by a stub that records its props: jsdom cannot measure a width, so the real chart
// would draw nothing. This checks exactly what the card hands to the chart.
interface StubSeries { key: string; name: string; color: string; values: number[]; area?: boolean; visible?: boolean }
interface StubProps {
  series: StubSeries[];
  labels: (index: number) => string;
  tooltipLabel: (index: number) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}
const chart = vi.hoisted(() => ({ props: null as null | StubProps, renders: 0 }));
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: (props: StubProps) => {
    chart.props = props;
    chart.renders += 1;
    return <div data-testid="line-chart" />;
  },
}));

const api = vi.hoisted(() => ({ performance: vi.fn(), categorySeries: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const SID = IDS.scheme;
const perf = () => fixture<PerformanceResponse>("performance_1y_equity");
const peers = () => fixture<CategorySeriesResponse>("peers_series_1y");
const never = () => new Promise<never>(() => {});
const nums = (points: { pct: string }[]) => points.map(point => Number(point.pct));

function withEnd(body: PerformanceResponse, end: string): PerformanceResponse {
  const next = structuredClone(body);
  next.fund[next.fund.length - 1].pct = end;
  next.period_returns.fund = end;
  return next;
}

function mount() {
  return render(<PerformanceChart schemeId={SID} fundName={NAME} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  chart.props = null;
  chart.renders = 0;
  api.performance.mockImplementation(() => Promise.resolve(perf()));
  api.categorySeries.mockImplementation(() => Promise.resolve(peers()));
});

describe("PerformanceChart", () => {
  it("test_default_period_is_1y_and_chip_pressed: seven chips 1M to All, 1Y pressed, both calls made for 1Y", async () => {
    mount();
    const chips = screen.getByRole("group", { name: "Performance period" });
    expect([...chips.querySelectorAll("button")].map(button => button.textContent)).toEqual(["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"]);
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "false");
    await screen.findByTestId("line-chart");
    expect(api.performance).toHaveBeenCalledWith(SID, "1Y", expect.any(AbortSignal));
    expect(api.categorySeries).toHaveBeenCalledWith(SID, "1Y", expect.any(AbortSignal));
  });

  it("shows a loading status until the performance arrives", async () => {
    const pending = deferred<PerformanceResponse>();
    api.performance.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("status", { name: "Loading performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Performance" })).toBeInTheDocument();
    await act(async () => { pending.resolve(perf()); });
    expect(screen.queryByRole("status", { name: "Loading performance" })).toBeNull();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
  });

  it("test_legend_shows_cumulative_period_return_per_line (the figures are the API's period_returns and the category's last point)", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.getByTestId("legend-fund")).toHaveTextContent(NAME);
    expect(screen.getByTestId("legend-fund-figure")).toHaveTextContent("+10.0%");
    expect(screen.getByTestId("legend-benchmark")).toHaveTextContent("Nifty 500");
    expect(screen.getByTestId("legend-benchmark-figure")).toHaveTextContent("+12.0%");
    expect(await screen.findByTestId("legend-category")).toHaveTextContent("Flexi Cap category average");
    // peers_series_1y ends at 10.8332 on 2026-10-23, the same day the fund (9.9997) and the benchmark (12.0000) end.
    expect(screen.getByTestId("legend-category-figure")).toHaveTextContent("+10.8%");
  });

  it("test_category_line_fades_in_when_tier3_arrives_and_third_legend_item_shows_loading_before", async () => {
    const slow = deferred<CategorySeriesResponse>();
    api.categorySeries.mockReturnValue(slow.promise);
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.getByTestId("legend-category")).toHaveTextContent("Category average");
    expect(screen.getByTestId("legend-category-figure")).toHaveTextContent("…");
    expect(screen.getByTestId("legend-category-figure")).toHaveAttribute("aria-busy", "true");
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "benchmark"]);
    await act(async () => { slow.resolve(peers()); });
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "benchmark", "category"]);
    expect(screen.getByTestId("legend-category-figure")).toHaveTextContent("+10.8%");
    expect(screen.getByTestId("legend-category-figure")).not.toHaveAttribute("aria-busy");
  });

  it("hands the chart three series in the palette colours, with an area under the fund line only", async () => {
    mount();
    await screen.findByTestId("legend-category-figure");
    await screen.findByText("+10.8%");
    const series = chart.props!.series;
    expect(series.map(s => [s.key, s.name, s.color, s.area ?? false, s.visible])).toEqual([
      ["fund", NAME, "var(--c2)", true, true],
      ["benchmark", "Nifty 500", "var(--c3)", false, true],
      ["category", "Flexi Cap category average", "var(--ui-text-muted)", false, true],
    ]);
    expect(series[0].values).toEqual(nums(perf().fund));
    expect(series[1].values).toEqual(nums(perf().benchmark!));
    expect(series[0].values).toHaveLength(260);
  });

  it("the category line is put on the fund's own dates: the real category series is daily (366 points) while the fund series skips days without a NAV (260), and the chart reads every line by position", async () => {
    mount();
    await screen.findByText("+10.8%");
    const category = chart.props!.series[2].values;
    // One category value per fund date, none for the days the fund has no NAV (for example 25 Oct 2025, a Saturday).
    expect(category).toHaveLength(260);
    const byDate = new Map(peers().points.map(point => [point.date, Number(point.pct)]));
    expect(category).toEqual(perf().fund.map(point => byDate.get(point.date)));
    // Hand-checked against the files: fund date 2025-10-26 is the third fund point and its category value is 0.0842 (2025-10-25's 0.0561 is skipped).
    expect(category.slice(0, 4)).toEqual([0, 0.0282, 0.0842, 0.1125]);
    expect(category[100]).toBe(4.0511);
    expect(category.at(-1)).toBe(10.8332);
  });

  it("a category date the series lacks takes the nearest earlier category value", async () => {
    const sparse = peers();
    sparse.points = sparse.points.filter(point => point.date !== "2025-10-24" && point.date !== "2025-10-26");
    api.categorySeries.mockImplementation(() => Promise.resolve(sparse));
    mount();
    await screen.findByText("+10.8%");
    // 24 Oct has no category point: the value of 23 Oct (0.0000) is held; 26 Oct has none: the value of 25 Oct (0.0561) is held.
    expect(chart.props!.series[2].values.slice(0, 4)).toEqual([0, 0, 0.0561, 0.1125]);
  });

  it("labels the axis and tooltip with short and long dates, formats values as signed percent, names the chart", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const props = chart.props!;
    expect(props.ariaLabel).toBe("Performance chart for 1Y");
    expect(props.labels(0)).toBe("Oct 25");
    expect(props.labels(259)).toBe("Oct 26");
    expect(props.labels(100)).toBe("Mar 26");
    expect(props.tooltipLabel(0)).toBe("23 Oct 2025");
    expect(props.tooltipLabel(100)).toBe("13 Mar 2026");
    expect(props.tooltipLabel(259)).toBe("23 Oct 2026");
    expect(props.formatValue(10)).toBe("+10.0%");
    expect(props.formatValue(0)).toBe("0.0%");
    expect(props.formatValue(-2.5)).toBe("-2.5%");
  });

  it("test_chip_click_refetches_and_morphs: a chip click asks for the new period and keeps the chart mounted", async () => {
    mount();
    await screen.findByTestId("line-chart");
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "false");
    expect(api.performance).toHaveBeenLastCalledWith(SID, "3M", expect.any(AbortSignal));
    expect(api.categorySeries).toHaveBeenLastCalledWith(SID, "3M", expect.any(AbortSignal));
    await act(async () => {});
    expect(chart.props!.ariaLabel).toBe("Performance chart for 3M");
    expect(chart.props!.labels(0)).toBe("23 Oct");
  });

  it("while the new period loads the previous lines stay on the chart (no skeleton), marked busy, then are replaced", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const before = chart.props!.series[0].values;
    const next = deferred<PerformanceResponse>();
    api.performance.mockReturnValue(next.promise);
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading performance" })).toBeNull();
    expect(screen.getByTestId("chart-wrap")).toHaveAttribute("aria-busy", "true");
    expect(chart.props!.series[0].values).toEqual(before);
    await act(async () => { next.resolve(withEnd(perf(), "3.0000")); });
    expect(screen.getByTestId("chart-wrap")).not.toHaveAttribute("aria-busy");
    expect(chart.props!.series[0].values.at(-1)).toBe(3);
    expect(screen.getByTestId("legend-fund-figure")).toHaveTextContent("+3.0%");
  });

  it("test_stale_response_for_earlier_period_is_ignored", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const byPeriod: Partial<Record<PerformancePeriod, ReturnType<typeof deferred<PerformanceResponse>>>> = { "3M": deferred(), "6M": deferred() };
    api.performance.mockImplementation((_id: string, period: PerformancePeriod) => byPeriod[period]!.promise);
    api.categorySeries.mockImplementation(never);
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    fireEvent.click(screen.getByRole("button", { name: "6M" }));
    await act(async () => { byPeriod["6M"]!.resolve(withEnd(perf(), "6.0000")); });
    await act(async () => { byPeriod["3M"]!.resolve(withEnd(perf(), "3.0000")); });
    expect(screen.getByRole("button", { name: "6M" })).toHaveAttribute("aria-pressed", "true");
    expect(chart.props!.series[0].values.at(-1)).toBe(6);
    expect(screen.getByTestId("legend-fund-figure")).toHaveTextContent("+6.0%");
  });

  it("test_legend_toggle_hides_line_and_dims_legend_item", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const item = screen.getByTestId("legend-fund");
    expect(item).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(item);
    expect(item).toHaveAttribute("aria-pressed", "false");
    expect(item.className).toContain("opacity-50");
    expect(chart.props!.series.find(s => s.key === "fund")!.visible).toBe(false);
    expect(chart.props!.series.find(s => s.key === "benchmark")!.visible).toBe(true);
    fireEvent.click(item);
    expect(item).toHaveAttribute("aria-pressed", "true");
    expect(chart.props!.series.find(s => s.key === "fund")!.visible).toBe(true);
  });

  it("a hidden line stays hidden after a period change", async () => {
    mount();
    await screen.findByTestId("line-chart");
    fireEvent.click(screen.getByTestId("legend-benchmark"));
    fireEvent.click(screen.getByRole("button", { name: "5Y" }));
    await act(async () => {});
    expect(chart.props!.series.find(s => s.key === "benchmark")!.visible).toBe(false);
  });

  it("test_fund_younger_than_period_shows_since_launch_note", async () => {
    api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_all_young_fund")));
    mount();
    await screen.findByTestId("line-chart");
    const notes = screen.getAllByTestId("perf-note").map(note => note.textContent);
    expect(notes).toEqual(["This fund is younger than the selected period, so the chart starts at its launch date."]);
  });

  it("a full-length fund has no note", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.queryByTestId("perf-note")).toBeNull();
  });

  it("test_no_benchmark_for_non_equity_omits_line_with_note", async () => {
    api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_1y_debt_no_benchmark")));
    mount();
    await screen.findByTestId("line-chart");
    await screen.findByTestId("legend-category-figure");
    await act(async () => {});
    expect(screen.queryByTestId("legend-benchmark")).toBeNull();
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "category"]);
    expect(screen.getByTestId("perf-note")).toHaveTextContent("No benchmark applies to this fund type, so only the fund line is shown.");
  });

  it("a benchmark without history says so", async () => {
    const body = perf();
    body.benchmark = null;
    body.benchmark_reason = "no_history";
    api.performance.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.getByTestId("perf-note")).toHaveTextContent("Benchmark history is not available yet, so only the fund line is shown.");
  });

  it("test_no_history_state: unavailable shows the reason and the chips stay", async () => {
    const body: Unavailable = { status: "unavailable", reason: "no_history" };
    api.performance.mockImplementation(() => Promise.resolve(body));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(screen.getByRole("button", { name: "5Y" })).toBeInTheDocument();
  });

  it("a failed performance shows its own error, and Retry refetches only the performance", async () => {
    api.performance.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(perf()));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load performance.");
    expect(api.categorySeries).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("line-chart");
    expect(api.performance).toHaveBeenCalledTimes(2);
    expect(api.categorySeries).toHaveBeenCalledTimes(1);
  });

  it("an unavailable category leaves out its legend item and its line", async () => {
    api.categorySeries.mockImplementation(() => Promise.resolve(fixture<Unavailable>("peers_unavailable")));
    mount();
    await screen.findByTestId("line-chart");
    await act(async () => {});
    expect(screen.queryByTestId("legend-category")).toBeNull();
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "benchmark"]);
  });

  it("a failed category shows a dash with an explanation and the fund and benchmark lines stay", async () => {
    api.categorySeries.mockRejectedValue(new Error("slow"));
    mount();
    await screen.findByTestId("line-chart");
    expect(await screen.findByTitle("Category figures could not be loaded")).toHaveTextContent("—");
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "benchmark"]);
  });

  it("a loss is shown in the negative colour in the legend", async () => {
    api.performance.mockImplementation(() => Promise.resolve(withEnd(perf(), "-4.2000")));
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.getByTestId("legend-fund-figure")).toHaveTextContent("-4.2%");
    expect(screen.getByTestId("legend-fund-figure").className).toContain("text-[var(--neg-text)]");
  });
});
