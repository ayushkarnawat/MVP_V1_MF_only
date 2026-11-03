import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { benchmarkDisplayName } from "@/lib/benchmarkDisplay";
import { formatPercent } from "@/lib/format";
import { renderInShell } from "@/shell/testing";
import { IDS, fixture } from "../fixtures";
import { columnHeader } from "../fundCopy";
import type { CurrentReturnsResponse, ReturnsResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { CurrentReturnsChart } from "./CurrentReturnsChart";

interface StubProps {
  buckets: { label: string; values: number[] }[];
  seriesColors: string[];
  formatValue: (value: number) => string;
  ariaLabel: string;
}
const chart = vi.hoisted(() => ({ props: null as null | StubProps }));
vi.mock("@/components/ui/charts", () => ({
  GroupedBarChart: (props: StubProps) => {
    chart.props = props;
    return <div data-testid="grouped-bar-chart" />;
  },
}));

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }];
const cur = () => fixture<CurrentReturnsResponse>("returns_current");
const section = (data: ReturnsResponse | null, over: Partial<FundSection<ReturnsResponse>> = {}): FundSection<ReturnsResponse> =>
  ({ status: "ready", data, reason: null, error: null, retry: vi.fn(), ...over });
const onShowModel = vi.fn();
function mount(current: FundSection<ReturnsResponse>, options: Parameters<typeof renderInShell>[1] = {}) {
  return renderInShell(
    <CurrentReturnsChart current={current} fundName={NAME} toggleSlot={<div data-testid="toggle-slot">toggle</div>} onShowModel={onShowModel} />,
    options,
  );
}
beforeEach(() => { chart.props = null; onShowModel.mockClear(); });

describe("CurrentReturnsChart: the Actual XIRR graph", () => {
  it("is the Performance card: the heading, then the toggle slot, then the legend and the chart, with no period buttons", () => {
    mount(section(cur()));
    expect(screen.getByRole("heading", { name: "Performance" })).toBeInTheDocument();
    expect(screen.getByTestId("toggle-slot")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Performance period" })).toBeNull();
    expect(screen.getByTestId("grouped-bar-chart")).toBeInTheDocument();
  });
  it("draws one group per table period, in table order, and every bar equals its table cell", () => {
    const data = cur();
    mount(section(data));
    const props = chart.props!;
    expect(props.ariaLabel).toBe(`Actual XIRR for ${NAME}`);
    expect(props.seriesColors).toEqual(["var(--c2)", "var(--c3)"]);
    data.columns.forEach((col, index) => {
      const holding = data.rows.holding_xirr[col];
      const bench = data.rows.benchmark_same_flows![col];
      expect(props.buckets[index].values[0]).toBe(holding == null ? 0 : Number(holding));
      expect(props.buckets[index].values[1]).toBe(bench == null ? 0 : Number(bench));
      const missing = holding == null && bench == null;
      expect(props.buckets[index].label).toBe(missing ? `${columnHeader(col)} —` : columnHeader(col));
    });
    expect(props.buckets).toHaveLength(data.columns.length);
  });
  it("formats each value like the table does", () => {
    mount(section(cur()));
    expect(chart.props!.formatValue(9.9997)).toBe(formatPercent("9.9997", { digits: 1 }));
    expect(chart.props!.formatValue(-3.25)).toBe(formatPercent("-3.25", { digits: 1 }));
  });
  it("a missing figure has no bar (value 0) and a dash after its group label", () => {
    mount(section(cur()));
    const threeYears = chart.props!.buckets.find(bucket => bucket.label.startsWith("3Y"))!;
    expect(threeYears.label).toBe("3Y —");
    expect(threeYears.values).toEqual([0, 0]);
  });
  it("a negative XIRR is passed through as a negative number", () => {
    const data = cur();
    data.rows.holding_xirr["1Y"] = "-3.2000";
    mount(section(data));
    expect(chart.props!.buckets[0].values[0]).toBe(-3.2);
  });
  it("the legend names your holding and the benchmark with its label and the same cash flows", () => {
    const data = { ...cur(), benchmark_label: "Nifty 500 TRI" };
    mount(section(data));
    const legend = screen.getByRole("list", { name: "Chart legend" });
    expect(within(legend).getByText("Your holding (XIRR)")).toBeInTheDocument();
    expect(within(legend).getByText(`${benchmarkDisplayName("Nifty 500 TRI")}, same cash flows`)).toBeInTheDocument();
  });
  it("without a benchmark_label the legend says Benchmark, same cash flows", () => {
    mount(section({ ...cur(), benchmark_label: null }));
    expect(screen.getByText("Benchmark, same cash flows")).toBeInTheDocument();
  });
  it.each([
    ["no_benchmark", "No benchmark applies to this fund type, so only your holding is shown."],
    ["no_history", "Benchmark history is not available yet, so only your holding is shown."],
  ])("without a benchmark (%s) it draws one series, one legend item and a notice", (reason, text) => {
    const data = cur();
    data.rows.benchmark_same_flows = null;
    data.benchmark_reason = reason;
    mount(section(data));
    expect(chart.props!.seriesColors).toEqual(["var(--c2)"]);
    expect(chart.props!.buckets[0].values).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Chart legend" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("current-chart-note")).toHaveTextContent(text);
  });
  it("loading and error use the card's own states and keep the toggle", () => {
    const { unmount } = mount(section(null, { status: "loading" }));
    expect(screen.getByRole("status", { name: "Loading returns" })).toBeInTheDocument();
    expect(screen.getByTestId("toggle-slot")).toBeInTheDocument();
    unmount();
    const retry = vi.fn();
    mount(section(null, { status: "error", retry }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load returns.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("toggle-slot")).toBeInTheDocument();
  });
  it("not held, for a member: a designed state names them and offers Model Portfolio Returns", () => {
    mount(section(null, { status: "unavailable", reason: "not_held" }), { scope: { members, viewMode: "member", memberId: IDS.dev } });
    expect(screen.getByText("Dev Rao does not hold this fund")).toBeInTheDocument();
    expect(screen.getByText("Actual XIRR uses your own purchases of a fund. Model Portfolio Returns shows how the fund itself has done.")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-bar-chart")).toBeNull();
    expect(screen.getByTestId("toggle-slot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show Model Portfolio Returns" }));
    expect(onShowModel).toHaveBeenCalledTimes(1);
  });
  it("not held, in the family view: the family wording", () => {
    mount(section(null, { status: "unavailable", reason: "not_held" }), { scope: { members, viewMode: "aggregate" } });
    expect(screen.getByText("No one in your family holds this fund")).toBeInTheDocument();
  });
  it("another unavailable reason shows the card's unavailable state, not the not-held box", () => {
    mount(section(null, { status: "unavailable", reason: "no_history" }));
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
    expect(screen.queryByText(/does not hold this fund/)).toBeNull();
  });
});
