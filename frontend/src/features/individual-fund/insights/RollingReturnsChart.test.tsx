import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { RollingResponse, Unavailable } from "../types";
import { RollingReturnsChart } from "./RollingReturnsChart";

// jsdom cannot measure a width, so the kit line chart is a stub that records the props the card hands to it.
interface LineStubProps {
  series: { key: string; name: string; color: string; values: number[]; area?: boolean; visible?: boolean }[];
  labels: (index: number) => string;
  tooltipLabel?: (index: number) => string;
  formatValue: (value: number) => string;
  ariaLabel: string;
  height?: number;
}
const chart = vi.hoisted(() => ({ props: null as null | LineStubProps }));
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: (props: LineStubProps) => {
    chart.props = props;
    return <div data-testid="line-chart" />;
  },
}));
const api = vi.hoisted(() => ({ rolling: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const rolling = (window: 1 | 3 | 5 = 3, shift = 0): RollingResponse => {
  const body = fixture<RollingResponse>("rolling_3y");
  body.window_years = window;
  // A shifted body has its own fund line, shift + index / 2 (exact in binary, so no rounding noise): 10, 10.5, 11 ... for shift 10.
  if (shift) body.points = body.points.map((point, index) => ({ ...point, fund: String(shift + index / 2) }));
  return body;
};
const noHistory = () => fixture<Unavailable>("rolling_no_history");
const mount = () => render(<RollingReturnsChart schemeId={IDS.scheme} />);
const select = () => screen.getByRole("combobox", { name: "Rolling window" }) as HTMLSelectElement;
const choose = (value: string) => fireEvent.change(select(), { target: { value } });
const legend = (key: string) => screen.getByTestId(`rolling-legend-${key}`);
const byKey = (key: string) => chart.props!.series.find(s => s.key === key);

beforeEach(() => {
  vi.clearAllMocks();
  chart.props = null;
  api.rolling.mockImplementation((_id: string, window: 1 | 3 | 5) => Promise.resolve(rolling(window)));
});

describe("RollingReturnsChart", () => {
  it("asks for the 3-year window first, once, and shows a loading status until the answer arrives", async () => {
    const pending = deferred<RollingResponse>();
    api.rolling.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("heading", { name: "Rolling Returns" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading rolling returns" })).toBeInTheDocument();
    pending.resolve(rolling());
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(api.rolling).toHaveBeenCalledTimes(1);
    expect(api.rolling).toHaveBeenCalledWith(IDS.scheme, 3, expect.any(AbortSignal));
  });

  it("the window dropdown offers 1 Year, 3 Years and 5 Years, with 3 Years chosen", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(within(select()).getAllByRole("option").map(option => [option.textContent, (option as HTMLOptionElement).value])).toEqual([
      ["1 Year", "1"], ["3 Years", "3"], ["5 Years", "5"],
    ]);
    expect(select().value).toBe("3");
  });

  it("draws the fund, the benchmark and the category: colours, an area under the fund, gaps filled from the month before", async () => {
    mount();
    await screen.findByTestId("line-chart");
    const props = chart.props!;
    expect(props.series.map(s => [s.key, s.name, s.color])).toEqual([
      ["fund", "Fund", "var(--c2)"], ["benchmark", "Benchmark", "var(--c3)"], ["category", "Category average", "var(--ui-text-muted)"],
    ]);
    // rolling_3y: 36 month-end points from 31 Oct 2023 to 30 Sep 2026, none missing; these are the first five.
    expect(byKey("fund")!.values).toHaveLength(36);
    expect(byKey("fund")!.values.slice(0, 5)).toEqual([9.9999, 9.9999, 9.9999, 10.0003, 10.0097]);
    expect(byKey("benchmark")!.values.slice(0, 5)).toEqual([12, 12, 12, 12, 12.0116]);
    expect(byKey("category")!.values.slice(0, 5)).toEqual([10.8331, 10.8335, 10.8334, 10.8332, 10.8437]);
    expect(byKey("fund")!.values.at(-1)).toBe(10.0097);
    expect(byKey("fund")!.area).toBe(true);
    expect(byKey("benchmark")!.area).toBeFalsy();
    expect(props.series.every(s => s.visible !== false)).toBe(true);
    expect(props.labels(0)).toBe("Oct 23");
    expect(props.labels(4)).toBe("Feb 24");
    expect(props.labels(35)).toBe("Sep 26");
    expect(props.tooltipLabel!(0)).toBe("31 Oct 2023, 3-year window");
    expect(props.formatValue(14.2)).toBe("14.2%");
    expect(props.formatValue(-1.26)).toBe("-1.3%");
    expect(props.ariaLabel).toBe("Rolling returns, 3-year window");
  });

  it("a month with no value for a line takes the value of the month before, and the first months take the first value", async () => {
    // The golden has no gaps, so two are made by hand: the fund's second month is 10.5 and its third is missing; the benchmark has no value in the first two months.
    const body = rolling();
    body.points[1].fund = "10.5000";
    body.points[2].fund = null;
    body.points[0].benchmark = null;
    body.points[1].benchmark = null;
    api.rolling.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("line-chart");
    expect(byKey("fund")!.values.slice(0, 5)).toEqual([9.9999, 10.5, 10.5, 10.0003, 10.0097]);
    expect(byKey("benchmark")!.values.slice(0, 5)).toEqual([12, 12, 12, 12, 12.0116]);
  });

  it("a line with no value at all (no benchmark, or no category) is left out", async () => {
    const body = rolling();
    body.points = body.points.map(point => ({ ...point, benchmark: null }));
    api.rolling.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("line-chart");
    expect(chart.props!.series.map(s => s.key)).toEqual(["fund", "category"]);
    expect(screen.queryByTestId("rolling-legend-benchmark")).toBeNull();
    expect(screen.getByTestId("rolling-legend-category")).toBeInTheDocument();
  });

  it("test_window_dropdown_1_3_5_refetches_and_morphs: a new window asks again, keeps the old lines while it loads, then swaps in the new ones", async () => {
    const next = deferred<RollingResponse>();
    mount();
    await screen.findByTestId("line-chart");
    const before = byKey("fund")!.values;
    api.rolling.mockReturnValueOnce(next.promise);
    choose("1");
    expect(select().value).toBe("1");
    expect(api.rolling).toHaveBeenLastCalledWith(IDS.scheme, 1, expect.any(AbortSignal));
    expect(screen.getByTestId("rolling-chart-wrap")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status", { name: "Loading rolling returns" })).toBeNull();
    expect(byKey("fund")!.values).toEqual(before);
    await act(async () => { next.resolve(rolling(1, 10)); });
    expect(screen.getByTestId("rolling-chart-wrap")).not.toHaveAttribute("aria-busy");
    expect(byKey("fund")!.values.slice(0, 5)).toEqual([10, 10.5, 11, 11.5, 12]);
    expect(chart.props!.ariaLabel).toBe("Rolling returns, 1-year window");
    expect(chart.props!.tooltipLabel!(1)).toBe("30 Nov 2023, 1-year window");
    choose("5");
    await screen.findByTestId("line-chart");
    expect(api.rolling).toHaveBeenLastCalledWith(IDS.scheme, 5, expect.any(AbortSignal));
    expect(api.rolling).toHaveBeenCalledTimes(3);
  });

  it("test_window_longer_than_history_shows_note: no_history for a window says how much history is missing, and keeps the dropdown", async () => {
    api.rolling.mockImplementation((_id: string, window: number) => Promise.resolve(window === 5 ? noHistory() : rolling()));
    mount();
    await screen.findByTestId("line-chart");
    choose("5");
    expect(await screen.findByTestId("rolling-note")).toHaveTextContent("This fund has less than 5 years of history, so there are no 5-year rolling returns to show.");
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(screen.queryByTestId("rolling-legend-fund")).toBeNull();
    expect(select().value).toBe("5");
    choose("3");
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("rolling-note")).toBeNull();
  });

  it("the note for a one year window says year, not years", async () => {
    api.rolling.mockImplementation(() => Promise.resolve(noHistory()));
    mount();
    choose("1");
    expect(await screen.findByTestId("rolling-note")).toHaveTextContent("This fund has less than 1 year of history, so there are no 1-year rolling returns to show.");
  });

  it("any other unavailable reason uses the shared wording", async () => {
    api.rolling.mockImplementation(() => Promise.resolve({ status: "unavailable", reason: "peers_unavailable" }));
    mount();
    expect(await screen.findByTestId("rolling-note")).toHaveTextContent("Category comparison is not available for this fund yet.");
  });

  it("each legend item toggles its line, and the others stay", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(["fund", "benchmark", "category"].map(key => legend(key).getAttribute("aria-pressed"))).toEqual(["true", "true", "true"]);
    expect(legend("fund")).toHaveTextContent("Fund");
    expect(legend("benchmark")).toHaveTextContent("Benchmark");
    expect(legend("category")).toHaveTextContent("Category average");
    fireEvent.click(legend("benchmark"));
    expect(legend("benchmark")).toHaveAttribute("aria-pressed", "false");
    expect(byKey("benchmark")!.visible).toBe(false);
    expect(byKey("fund")!.visible).not.toBe(false);
    expect(byKey("category")!.visible).not.toBe(false);
    fireEvent.click(legend("benchmark"));
    expect(byKey("benchmark")!.visible).not.toBe(false);
  });

  it("test_stale_response_ignored: a late answer for an earlier window does not replace the newer one", async () => {
    const one = deferred<RollingResponse>();
    const five = deferred<RollingResponse>();
    mount();
    await screen.findByTestId("line-chart");
    api.rolling.mockReturnValueOnce(five.promise).mockReturnValueOnce(one.promise);
    choose("5");
    choose("1");
    await act(async () => { one.resolve(rolling(1, 10)); });
    expect(byKey("fund")!.values[0]).toBe(10);
    await act(async () => { five.resolve(rolling(5, 50)); });
    expect(byKey("fund")!.values[0]).toBe(10);
    expect(chart.props!.ariaLabel).toBe("Rolling returns, 1-year window");
  });

  it("a failed request shows the error with Retry, and Retry asks again for the same window", async () => {
    api.rolling.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(rolling()));
    mount();
    expect(await screen.findByText("Couldn't load rolling returns.")).toBeInTheDocument();
    expect(select()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(api.rolling).toHaveBeenCalledTimes(2);
    expect(api.rolling).toHaveBeenLastCalledWith(IDS.scheme, 3, expect.any(AbortSignal));
  });

  it("is a card with 20 px padding", async () => {
    mount();
    await screen.findByTestId("line-chart");
    expect(screen.getByRole("heading", { name: "Rolling Returns" }).closest("section")!.className).toContain("p-5");
  });
});
