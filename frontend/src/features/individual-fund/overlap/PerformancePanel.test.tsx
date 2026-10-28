import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { PerformancePeriod, PerformanceResponse, Unavailable } from "../types";
import { PerformancePanel } from "./PerformancePanel";

interface StubSeries { key: string; name: string; color: string; values: number[]; area?: boolean; visible?: boolean }
interface StubProps {
  series: StubSeries[];
  labels: (index: number) => string;
  tooltipLabel: (index: number) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}
const chart = vi.hoisted(() => ({ props: null as null | StubProps }));
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: (props: StubProps) => {
    chart.props = props;
    return <div data-testid="line-chart" />;
  },
}));

const api = vi.hoisted(() => ({ performance: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const A_ID = IDS.scheme;
const B_ID = IDS.youngScheme;
const A = "Alpha Flexi Cap Fund - Direct Plan";
const B = "Kappa Young Fund";
const equity = () => fixture<PerformanceResponse>("performance_1y_equity");
const young = () => fixture<PerformanceResponse>("performance_all_young_fund");
const unavailable = (reason: string): Unavailable => ({ status: "unavailable", reason });

function answer(byId: Record<string, PerformanceResponse | Unavailable | Promise<never>>) {
  api.performance.mockImplementation((id: string) => Promise.resolve(byId[id] ?? unavailable("no_history")));
}
function mount() {
  return render(<PerformancePanel aId={A_ID} bId={B_ID} aName={A} bName={B} />);
}
const calls = () => api.performance.mock.calls.map(call => [call[0], call[1]]);

beforeEach(() => {
  vi.clearAllMocks();
  chart.props = null;
  answer({ [A_ID]: equity(), [B_ID]: young() });
});

describe("PerformancePanel", () => {
  it("test_performance_comparison_calls_performance_endpoint_for_both_funds: one performance request for each fund, 1Y by default", async () => {
    mount();
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(calls()).toEqual(expect.arrayContaining([[A_ID, "1Y"], [B_ID, "1Y"]]));
    expect(api.performance).toHaveBeenCalledTimes(2);
    expect(api.performance.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
  });

  it("period chips 1M to All, 1Y pressed; choosing one asks again for both funds", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const chips = screen.getByRole("group", { name: "Comparison period" });
    expect([...chips.querySelectorAll("button")].map(button => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["1M", "false"], ["3M", "false"], ["6M", "false"], ["1Y", "true"], ["3Y", "false"], ["5Y", "false"], ["All", "false"],
    ]);
    fireEvent.click(within(chips).getByRole("button", { name: "3Y" }));
    await waitFor(() => expect(calls()).toEqual(expect.arrayContaining([[A_ID, "3Y"], [B_ID, "3Y"]])));
    expect(api.performance).toHaveBeenCalledTimes(4);
    expect(within(chips).getByRole("button", { name: "3Y" })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws one line per fund, both on the first fund's dates (the second is put on them, nearest earlier value)", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const [a, b] = chart.props!.series;
    expect([a.key, a.name, a.color, a.area]).toEqual(["a", A, "var(--c2)", true]);
    expect([b.key, b.name, b.color]).toEqual(["b", B, "var(--c3)"]);
    expect(a.values).toHaveLength(260);
    expect(b.values).toHaveLength(260);
    expect(a.values.slice(0, 3)).toEqual([0, 0.0257, 0.0785]);
    // The young fund starts 23 Mar 2026 and has a point on Sundays only; the first fund has none on 29 Mar, so 30 Mar takes the 29 Mar value.
    expect(b.values[0]).toBe(0);
    expect(b.values[107]).toBe(0);
    expect(b.values[112]).toBe(0.1265);
    expect(b.values[117]).toBe(0.2739);
    expect(b.values[259]).toBe(4.6154);
    expect(a.values[259]).toBe(9.9997);
  });

  it("chart text: dates for the axis and the tooltip, signed percent for values", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(chart.props!.labels(0)).toBe("Oct 25");
    expect(chart.props!.tooltipLabel(0)).toBe("23 Oct 2025");
    expect(chart.props!.formatValue(9.9997)).toBe("+10.0%");
    expect(chart.props!.ariaLabel).toBe("Performance comparison chart for 1Y");
  });

  it("the table and the legend carry each fund's return for the period, with its colour for up and down", async () => {
    mount();
    expect(await screen.findByTestId("perf-return-a")).toHaveTextContent("+10.0%");
    expect(screen.getByTestId("perf-return-b")).toHaveTextContent("+4.6%");
    expect(screen.getByRole("table", { name: "Performance comparison" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader")).toHaveTextContent("1Y return");
    expect(screen.getByTestId("perf-legend-a")).toHaveTextContent(`${A}+10.0%`);
    expect(screen.getByTestId("perf-legend-b")).toHaveTextContent(`${B}+4.6%`);
    expect(screen.getByTestId("perf-return-a").className).toContain("pos-text");
  });

  it("a losing fund reads in the negative colour; All reads 'Return since launch'", async () => {
    const down = equity();
    down.period_returns.fund = "-3.2500";
    answer({ [A_ID]: down, [B_ID]: young() });
    mount();
    expect(await screen.findByTestId("perf-return-a")).toHaveTextContent("-3.3%");
    expect(screen.getByTestId("perf-return-a").className).toContain("neg-text");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("rowheader", { name: "Return since launch" })).toBeInTheDocument();
  });

  it("a fund younger than the period adds a note", async () => {
    mount();
    expect(await screen.findByTestId("perf-note")).toHaveTextContent("One of these funds is younger than the selected period, so its line starts at its launch date.");
  });

  it("one fund without a price history: its line, figure and cell are left out, with the reason under the table; the other is still drawn", async () => {
    answer({ [A_ID]: equity(), [B_ID]: unavailable("no_history") });
    mount();
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(chart.props!.series.map(series => series.key)).toEqual(["a"]);
    expect(screen.getByTestId("perf-return-b")).toHaveTextContent("—");
    expect(screen.getByTestId("perf-legend-b")).toHaveTextContent(`${B}—`);
    expect(screen.getByTestId("perf-unavailable-b")).toHaveTextContent(`${B}: No price history yet for this fund.`);
    expect(screen.queryByTestId("perf-unavailable-a")).toBeNull();
    expect(screen.queryByTestId("perf-note")).toBeNull();
  });

  it("the first fund missing: the second fund's dates are used and only its line is drawn", async () => {
    answer({ [A_ID]: unavailable("no_history"), [B_ID]: young() });
    mount();
    await screen.findByTestId("line-chart");
    expect(chart.props!.series.map(series => series.key)).toEqual(["b"]);
    expect(chart.props!.series[0].values).toHaveLength(32);
    expect(screen.getByTestId("perf-unavailable-a")).toBeInTheDocument();
  });

  it("both funds unavailable: no chart, dashes, both reasons, no error box", async () => {
    answer({ [A_ID]: unavailable("no_history"), [B_ID]: unavailable("no_history") });
    mount();
    expect(await screen.findByTestId("perf-unavailable-a")).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(screen.getByTestId("perf-return-a")).toHaveTextContent("—");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a loading status first, and one failed request is one error box for the panel with a Retry that asks again for both", async () => {
    const slow = deferred<PerformanceResponse>();
    api.performance.mockImplementation((id: string) => (id === A_ID ? slow.promise : Promise.resolve(young())));
    mount();
    expect(screen.getByRole("status", { name: "Loading performance comparison" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Comparison period" })).toBeInTheDocument();
    await act(async () => { slow.reject(new Error("boom")); });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load performance comparison.");
    answer({ [A_ID]: equity(), [B_ID]: young() });
    const before = api.performance.mock.calls.length;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(api.performance.mock.calls.length).toBe(before + 2);
  });

  it("every period is a valid request value", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const periods: PerformancePeriod[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"];
    for (const period of periods.filter(p => p !== "1Y")) {
      fireEvent.click(screen.getByRole("button", { name: period }));
      await waitFor(() => expect(calls()).toContainEqual([A_ID, period]));
      await screen.findByTestId("line-chart");
    }
    expect(calls().filter(call => call[0] === B_ID).map(call => call[1])).toEqual(["1Y", "1M", "3M", "6M", "3Y", "5Y", "All"]);
  });
});
