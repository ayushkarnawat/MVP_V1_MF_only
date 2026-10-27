import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { PeriodBucket, PeriodReturnsPeriod, PeriodReturnsResponse, Unavailable } from "../types";
import { PeriodReturnsChart } from "./PeriodReturnsChart";

// jsdom cannot measure a width, so the kit grouped bar chart is a stub that records the props the card hands to it.
interface BarStubProps {
  buckets: { label: string; values: number[] }[];
  seriesColors: string[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  onBucketClick?: (index: number) => void;
  height?: number;
}
const chart = vi.hoisted(() => ({ props: null as null | BarStubProps }));
vi.mock("@/components/ui/charts", () => ({
  GroupedBarChart: (props: BarStubProps) => {
    chart.props = props;
    return <div data-testid="bar-chart" data-count={props.buckets.length} />;
  },
}));
const api = vi.hoisted(() => ({ periodReturns: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const y1 = () => fixture<PeriodReturnsResponse>("period_returns_1y");
const y5 = () => fixture<PeriodReturnsResponse>("period_returns_5y");
function made(bucket: PeriodReturnsResponse["bucket"], period: PeriodReturnsPeriod, labels: string[]): PeriodReturnsResponse {
  const buckets: PeriodBucket[] = labels.map((label, index) => ({
    label, start: "2026-01-01", end: "2026-02-01", fund: String(index + 1), benchmark: String(index), category: "0.5",
  }));
  return { status: "ready", period, bucket, buckets };
}
const mount = () => render(<PeriodReturnsChart schemeId={IDS.scheme} />);
const chips = () => within(screen.getByRole("group", { name: "Period Returns range" })).getAllByRole("button");
const chip = (name: string) => within(screen.getByRole("group", { name: "Period Returns range" })).getByRole("button", { name });
const legend = (key: string) => screen.getByTestId(`period-legend-${key}`);
const labels = () => chart.props!.buckets.map(b => b.label);

beforeEach(() => {
  vi.clearAllMocks();
  chart.props = null;
  api.periodReturns.mockImplementation((_id: string, period: string) => Promise.resolve(period === "5Y" ? y5() : y1()));
});

describe("PeriodReturnsChart", () => {
  it("test_title_is_period_returns: the heading, then the seven chips 1M to All with 1Y pressed", async () => {
    mount();
    expect(screen.getByRole("heading", { name: "Period Returns" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading period returns" })).toBeInTheDocument();
    await screen.findByTestId("bar-chart");
    expect(chips().map(button => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["1M", "false"], ["3M", "false"], ["6M", "false"], ["1Y", "true"], ["3Y", "false"], ["5Y", "false"], ["All", "false"],
    ]);
    expect(api.periodReturns).toHaveBeenCalledTimes(1);
    expect(api.periodReturns).toHaveBeenCalledWith(IDS.scheme, "1Y", expect.any(AbortSignal));
  });

  it("draws one group per bucket with the fund, the benchmark and the category; a missing figure is a zero bar", async () => {
    mount();
    await screen.findByTestId("bar-chart");
    const props = chart.props!;
    expect(labels()).toEqual(["Nov", "Dec", "Jan", "Feb"]);
    expect(props.buckets.map(b => b.values)).toEqual([[2.1, 1.8, 1.9], [-0.6, -0.2, -0.4], [1.4, 1.1, 1.2], [0.9, 0, 0.7]]);
    expect(props.seriesColors).toEqual(["var(--c2)", "var(--c3)", "var(--ui-text-muted)"]);
    expect(props.ariaLabel).toBe("Period returns for 1Y");
    expect(props.formatValue(2.1)).toBe("+2.1%");
    expect(props.formatValue(-0.6)).toBe("-0.6%");
    expect(props.formatValue(0)).toBe("0.0%");
  });

  it("a series that has no figure in any bucket (no benchmark, no category) is not drawn, and has no legend item", async () => {
    const body = y1();
    body.buckets = body.buckets.map(b => ({ ...b, benchmark: null }));
    api.periodReturns.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("bar-chart");
    expect(chart.props!.seriesColors).toEqual(["var(--c2)", "var(--ui-text-muted)"]);
    expect(chart.props!.buckets[0].values).toEqual([2.1, 1.9]);
    expect(screen.queryByTestId("period-legend-benchmark")).toBeNull();
  });

  it("test_chip_changes_bucket_width_label_set: the bucket and its labels follow the chip, and the note says which", async () => {
    const responses: Record<string, PeriodReturnsResponse> = {
      "1M": made("week", "1M", ["W1", "W2", "W3", "W4", "W5"]),
      "1Y": y1(),
      "3Y": made("quarter", "3Y", ["Q1 2024", "Q2 2024", "Q3 2024"]),
      "5Y": y5(),
    };
    api.periodReturns.mockImplementation((_id: string, period: string) => Promise.resolve(responses[period]));
    mount();
    await screen.findByTestId("bar-chart");
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are monthly for 1Y.");
    fireEvent.click(chip("1M"));
    await act(async () => {});
    expect(labels()).toEqual(["W1", "W2", "W3", "W4", "W5"]);
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are weekly for 1M.");
    fireEvent.click(chip("3Y"));
    await act(async () => {});
    expect(labels()).toEqual(["Q1 2024", "Q2 2024", "Q3 2024"]);
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are quarterly for 3Y.");
    fireEvent.click(chip("5Y"));
    await act(async () => {});
    expect(labels()).toEqual(["2022", "2023", "2024", "2025", "2026 YTD"]);
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are yearly for 5Y. The current year is shown year to date.");
    expect(chart.props!.ariaLabel).toBe("Period returns for 5Y");
    expect(api.periodReturns.mock.calls.map(call => call[1])).toEqual(["1Y", "1M", "3Y", "5Y"]);
  });

  it("test_chip_click_morphs_bar_count: the old bars stay while the new period loads, then the bar count changes", async () => {
    const pending = deferred<PeriodReturnsResponse>();
    mount();
    await screen.findByTestId("bar-chart");
    expect(chart.props!.buckets).toHaveLength(4);
    api.periodReturns.mockReturnValueOnce(pending.promise);
    fireEvent.click(chip("5Y"));
    expect(chip("5Y")).toHaveAttribute("aria-pressed", "true");
    expect(chip("1Y")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("period-chart-wrap")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status", { name: "Loading period returns" })).toBeNull();
    expect(chart.props!.buckets).toHaveLength(4);
    // The note and the chart label still describe the bars on screen (monthly, 1Y), not the chip that was just pressed.
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are monthly for 1Y.");
    expect(chart.props!.ariaLabel).toBe("Period returns for 1Y");
    await act(async () => { pending.resolve(y5()); });
    expect(screen.getByTestId("period-chart-wrap")).not.toHaveAttribute("aria-busy");
    expect(chart.props!.buckets).toHaveLength(5);
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are yearly for 5Y.");
  });

  it("test_stale_response_ignored: a late answer for an earlier chip does not replace the newer one", async () => {
    const late5 = deferred<PeriodReturnsResponse>();
    const fast3 = deferred<PeriodReturnsResponse>();
    mount();
    await screen.findByTestId("bar-chart");
    api.periodReturns.mockReturnValueOnce(late5.promise).mockReturnValueOnce(fast3.promise);
    fireEvent.click(chip("5Y"));
    fireEvent.click(chip("3Y"));
    await act(async () => { fast3.resolve(made("quarter", "3Y", ["Q1 2024", "Q2 2024"])); });
    expect(labels()).toEqual(["Q1 2024", "Q2 2024"]);
    await act(async () => { late5.resolve(y5()); });
    expect(labels()).toEqual(["Q1 2024", "Q2 2024"]);
    expect(chip("3Y")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("period-note")).toHaveTextContent("Bars are quarterly for 3Y.");
  });

  it("test_bar_click_opens_values_popup: the bucket's own label, the three figures and the dates, and a missing figure is a dash", async () => {
    mount();
    await screen.findByTestId("bar-chart");
    act(() => { chart.props!.onBucketClick!(1); });
    const dialog = screen.getByRole("dialog", { name: "Dec 2025" });
    expect(within(dialog).getAllByTestId("bar-popup-row").map(row => [within(row).getByRole("term").textContent, within(row).getByRole("definition").textContent])).toEqual([
      ["Fund", "-0.6%"], ["Benchmark", "-0.2%"], ["Category average", "-0.4%"], ["Period", "30 Nov 2025 to 31 Dec 2025"],
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { chart.props!.onBucketClick!(3); });
    const feb = screen.getByRole("dialog", { name: "Feb 2026" });
    expect(within(feb).getAllByTestId("bar-popup-row").map(row => within(row).getByRole("definition").textContent)).toEqual([
      "+0.9%", "—", "+0.7%", "31 Jan 2026 to 28 Feb 2026",
    ]);
  });

  it("the popup still lists every series when a legend item has hidden it, and a click on a bucket that does not exist does nothing", async () => {
    mount();
    await screen.findByTestId("bar-chart");
    fireEvent.click(legend("category"));
    act(() => { chart.props!.onBucketClick!(0); });
    expect(within(screen.getByRole("dialog", { name: "Nov 2025" })).getByText("Category average")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    act(() => { chart.props!.onBucketClick!(40); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("each legend item toggles its series: it leaves the bars and the colours, and comes back", async () => {
    mount();
    await screen.findByTestId("bar-chart");
    expect(["fund", "benchmark", "category"].map(key => legend(key).getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect(legend("fund")).toHaveTextContent("Fund");
    expect(legend("benchmark")).toHaveTextContent("Benchmark");
    expect(legend("category")).toHaveTextContent("Category average");
    fireEvent.click(legend("fund"));
    expect(legend("fund")).toHaveAttribute("aria-pressed", "false");
    expect(chart.props!.seriesColors).toEqual(["var(--c3)", "var(--ui-text-muted)"]);
    expect(chart.props!.buckets[0].values).toEqual([1.8, 1.9]);
    fireEvent.click(legend("fund"));
    expect(chart.props!.seriesColors).toHaveLength(3);
    expect(chart.props!.buckets[0].values).toEqual([2.1, 1.8, 1.9]);
  });

  it("an unavailable answer prints the shared wording and no chart, and the chips stay", async () => {
    api.periodReturns.mockImplementation(() => Promise.resolve({ status: "unavailable", reason: "peers_unavailable" } satisfies Unavailable));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Category comparison is not available for this fund yet.");
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(chips()).toHaveLength(7);
  });

  it("a failed request shows the error with Retry, and Retry asks again for the same chip", async () => {
    api.periodReturns.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(y1()));
    mount();
    expect(await screen.findByText("Couldn't load period returns.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("bar-chart")).toBeInTheDocument();
    expect(api.periodReturns).toHaveBeenCalledTimes(2);
    expect(api.periodReturns).toHaveBeenLastCalledWith(IDS.scheme, "1Y", expect.any(AbortSignal));
  });

  it("is a card with 20 px padding", async () => {
    mount();
    await screen.findByTestId("bar-chart");
    expect(screen.getByRole("heading", { name: "Period Returns" }).closest("section")!.className).toContain("p-5");
  });
});
