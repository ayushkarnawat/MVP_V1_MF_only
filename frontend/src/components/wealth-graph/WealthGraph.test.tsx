import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, invalidateApiCache } from "@/lib/apiClient";
import { WealthCard, type WealthCardProps } from "@/features/home/sections/WealthCard";
import type { WealthSeriesResponse } from "@/features/home/types";
import type {
  WealthBenchmarkOption,
  WealthSeriesData,
  WealthSeriesQuery,
  WealthScope,
} from "./types";
import { benchmarkColor } from "./benchmarkColors";
import { useWealthSeries } from "./useWealthSeries";
import { WealthGraph, type WealthGraphProps } from "./WealthGraph";

// The kit chart is replaced by a stub that records its props: jsdom cannot measure a width, so the real
// chart would draw nothing. This checks exactly what WealthGraph hands to the chart.
interface StubProps {
  series: { key: string; color: string; area?: boolean; values: number[] }[];
  secondSeries?: { name: string; color: string; values: number[] };
  benchmarkLines?: { id: string; label: string; color: string; points: { date: string; pct: string }[] }[];
  dates?: string[];
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

const BENCHMARK_OPTIONS: WealthBenchmarkOption[] = [
  { index: "nifty_50", label: "Nifty 50", recommended: false },
  { index: "nifty_500", label: "Nifty 500", recommended: false },
  { index: "nifty_largemidcap_250", label: "Nifty LargeMidcap 250", recommended: true },
  { index: "nifty_midcap_150", label: "Nifty Midcap 150", recommended: false },
  { index: "nifty_smallcap_250", label: "Nifty Smallcap 250", recommended: false },
];

function buildMonthlySeries(): WealthSeriesResponse {
  const dates: string[] = [];
  for (let d = 23; d <= 30; d++) dates.push(`2026-09-${String(d).padStart(2, "0")}`);
  for (let d = 1; d <= 23; d++) dates.push(`2026-10-${String(d).padStart(2, "0")}`);

  const points = dates.map((date, i) => ({
    date,
    value: i === 0 ? "5095.60" : i === 30 ? "5212.00" : `${5096 + i * 3}.60`,
  }));
  const benchPoints = dates.map((date, i) => ({
    date,
    pct: i === 0 ? "0.0000" : i === 1 ? "0.0098" : i === 30 ? "0.2145" : `0.${String(i).padStart(2, "0")}00`,
  }));

  return {
    scope: "aggregate",
    member_id: null,
    nav_as_of: "2026-10-23",
    partial: false,
    missing_funds: [],
    computed_at: "2026-10-23T13:00:00Z",
    period: "1M",
    start: "2026-09-23",
    end: "2026-10-23",
    clamped: false,
    empty: false,
    points,
    start_value: "5095.60",
    end_value: "5212.00",
    net_contributions: "0.00",
    change_amount: "116.40",
    change_pct: "2.2843",
    change_method: "modified_dietz",
    benchmark: {
      index: "nifty_50",
      label: "Nifty 50",
      available: true,
      pct: "0.2145",
      effective_start: "2026-09-23",
      clipped: false,
      points: benchPoints,
    },
  };
}

function buildOneDaySeries(): WealthSeriesData {
  return {
    empty: false,
    points: [
      { date: "2026-10-22", value: "5200.00" },
      { date: "2026-10-23", value: "5212.00" },
    ],
    benchmark: null,
  };
}

function buildClippedSeries(): WealthSeriesData {
  return {
    empty: false,
    points: [
      { date: "2026-08-25", value: "0.00" },
      { date: "2026-09-01", value: "2920.20" },
      { date: "2026-10-23", value: "3012.00" },
    ],
    benchmark: {
      index: "nifty_smallcap_250",
      label: "Nifty Smallcap 250",
      available: true,
      pct: "0.7600",
      effective_start: "2026-09-01",
      clipped: true,
      points: [
        { date: "2026-09-01", pct: "0.0000" },
        { date: "2026-10-23", pct: "0.7600" },
      ],
    },
  };
}

function buildEmptyCustomSeries(): WealthSeriesData {
  return {
    empty: true,
    points: [],
    benchmark: null,
  };
}

function setupGraph(overrides: Partial<WealthGraphProps> = {}) {
  const handlers = {
    onPeriodChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onBenchmarksChange: vi.fn(),
    onRetry: vi.fn(),
    onImport: vi.fn(),
  };
  const props: WealthGraphProps = {
    status: "data",
    data: buildMonthlySeries(),
    period: "1M",
    customRange: { from: null, to: null },
    today: "2026-10-23",
    benchmarkOptions: BENCHMARK_OPTIONS,
    benchmarks: ["nifty_50"],
    hideValues: false,
    ...handlers,
    ...overrides,
  };
  const view = render(<WealthGraph {...props} />);
  return {
    ...view,
    handlers,
    props,
    rerenderWith: (next: Partial<WealthGraphProps>) => view.rerender(<WealthGraph {...props} {...next} />),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  chart.props = null;
  invalidateApiCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WealthGraph", () => {
  it("renders the same chart, period buttons, custom dates, benchmark control and note as the Home card did", () => {
    const { handlers } = setupGraph();

    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(chart.props?.series).toHaveLength(1);
    expect(chart.props?.series[0].color).toBe("var(--c1)");
    expect(chart.props?.secondSeries?.name).toBe("Nifty 50");
    expect(chart.props?.secondSeries?.color).toBe("var(--c3)");

    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1M" })).toHaveAttribute("aria-checked", "true");

    const trigger = screen.getByRole("button", { name: /^Benchmark:\s*Nifty 50$/ });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByTestId("benchmark-line")).toHaveTextContent("Nifty 50 +0.21%");
    expect(screen.getByTestId("wealth-note")).toBeInTheDocument();
    expect(screen.getByText("Change excludes new money")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(handlers.onPeriodChange).toHaveBeenCalledWith("custom");
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
  });

  describe("controls", () => {
    it("lists the benchmarks, selects the current one and reports a change", () => {
      const { handlers } = setupGraph();
      fireEvent.click(screen.getByRole("button", { name: /^Benchmark:\s*Nifty 50$/ }));
      expect(screen.getAllByRole("checkbox")).toHaveLength(5);
      expect(screen.getByRole("checkbox", { name: "Nifty 50" })).toBeChecked();
      fireEvent.click(screen.getByRole("checkbox", { name: "Nifty 500" }));
      expect(handlers.onBenchmarksChange).toHaveBeenCalledWith(["nifty_50", "nifty_500"]);
    });

    it("shows the period buttons with the current one checked and reports a change", () => {
      const { handlers } = setupGraph();
      expect(screen.getByRole("radio", { name: "1M" }).getAttribute("aria-checked")).toBe("true");
      fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
      expect(handlers.onPeriodChange).toHaveBeenCalledWith("1Y");
    });

    it("says the change excludes new money, except for a custom range", () => {
      const first = setupGraph();
      expect(screen.getByText("Change excludes new money")).toBeInTheDocument();
      first.unmount();
      setupGraph({ period: "custom" });
      expect(screen.queryByText("Change excludes new money")).toBeNull();
    });

    it("says so, and keeps the period buttons, when a custom range has no investments", () => {
      setupGraph({
        data: buildEmptyCustomSeries(),
        period: "custom",
        customRange: { from: "2016-10-23", to: "2016-12-31" },
      });
      expect(screen.getByText("No investments in this range.")).toBeInTheDocument();
      expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import statement" })).toBeNull();
    });
  });

  describe("custom range", () => {
    it("opens the calendar when Custom is chosen", () => {
      const { handlers } = setupGraph();
      expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
      fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
      expect(handlers.onPeriodChange).toHaveBeenCalledWith("custom");
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    });

    it("shows the chosen range on the Custom button and on the right, and reopens the calendar from there", () => {
      setupGraph({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
      expect(screen.getByRole("radio", { name: "05 Oct – 12 Oct" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    });

    it("closes the calendar on Escape and returns focus to Choose dates", () => {
      setupGraph({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
      const choose = screen.getByRole("button", { name: "Choose dates" });
      fireEvent.click(choose);
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("button", { name: "Previous month" }), { key: "Escape" });
      expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
      expect(choose).toHaveFocus();
    });

    it("keeps the calendar open after the first click and closes it when the range is complete", () => {
      const { handlers } = setupGraph({ period: "custom", customRange: { from: "2026-10-05", to: null } });
      fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
      fireEvent.click(screen.getByRole("button", { name: "12 October 2026" }));
      expect(handlers.onCustomRangeChange).toHaveBeenCalledWith({ from: "2026-10-05", to: "2026-10-12" });
      expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    });

    it("does not close the calendar on a click that only sets the start", () => {
      const { handlers } = setupGraph({ period: "custom", customRange: { from: null, to: null } });
      fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
      fireEvent.click(screen.getByRole("button", { name: "5 October 2026" }));
      expect(handlers.onCustomRangeChange).toHaveBeenCalledWith({ from: "2026-10-05", to: null });
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    });

    it("closes the calendar when another period is chosen", () => {
      const { rerenderWith } = setupGraph({ period: "custom", customRange: { from: "2026-10-05", to: "2026-10-12" } });
      fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
      expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
      rerenderWith({ period: "1M" });
      expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
    });

    it("limits the calendar to the data's own date (today) and ten years back", () => {
      setupGraph({ period: "custom", customRange: { from: "2026-10-05", to: null } });
      fireEvent.click(screen.getByRole("button", { name: "Choose dates" }));
      expect(screen.getByRole("button", { name: "24 October 2026" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "23 October 2026" })).toBeEnabled();
    });
  });

  describe("chart and notes", () => {
    it("draws the portfolio as a filled line of the series' values, with day-month labels", () => {
      setupGraph();
      const props = chart.props!;
      const data = buildMonthlySeries();
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
      setupGraph();
      const second = chart.props!.secondSeries!;
      expect(second.name).toBe("Nifty 50");
      expect(second.color).toBe("var(--c3)");
      expect(second.values).toHaveLength(31);
      expect(second.values[0]).toBe(0);
      expect(second.values[1]).toBe(0.0098);
    });

    it.each([
      ["nifty_50", "var(--c3)"],
      ["nifty_500", "var(--c5)"],
      ["nifty_largemidcap_250", "var(--c6)"],
      ["nifty_midcap_150", "var(--c4)"],
      ["nifty_smallcap_250", "var(--c2)"],
    ])("uses the mapped colour for the %s stroke and text", (index, color) => {
      const data = buildMonthlySeries();
      const option = BENCHMARK_OPTIONS.find(opt => opt.index === index)!;
      data.benchmark = { ...data.benchmark!, index, label: option.label };
      setupGraph({ data, benchmarks: [index] });

      expect(screen.getByTestId("benchmark-line")).toHaveTextContent(option.label);
      expect(chart.props?.secondSeries?.color).toBe(color);
      expect(screen.getByTestId("benchmark-line")).toHaveStyle({ color });
    });

    it("uses a distinct colour for each benchmark", () => {
      const colors = BENCHMARK_OPTIONS.map(({ index, label }) => {
        const data = buildMonthlySeries();
        data.benchmark = { ...data.benchmark!, index, label };
        const view = setupGraph({ data, benchmarks: [index] });
        const color = chart.props!.secondSeries!.color;
        view.unmount();
        return color;
      });
      expect(new Set(colors).size).toBe(5);
    });

    it("formats axis values as rupees and percentages without floating point formatting", () => {
      setupGraph();
      const props = chart.props!;
      expect(props.formatValue(5212)).toBe("₹5,212");
      expect(props.formatValue(5211.6)).toBe("₹5,212");
      expect(props.formatValue(21347320)).toBe("₹2.13 Cr");
      expect(props.formatValue(-1500)).toBe("-₹1,500");
      expect(props.formatPercent(0.2145)).toBe("+0.2%");
      expect(props.formatPercent(-1.25)).toBe("-1.3%");
    });

    it("masks chart values when hideValues is true while keeping the benchmark line", () => {
      setupGraph({ hideValues: true });
      expect(chart.props?.formatValue(5212)).toBe("••••••");
      expect(screen.getByTestId("benchmark-line").textContent).toContain("Nifty 50");
    });

    it("leaves the benchmark off the chart when its history starts after the period (clipped) and says so", () => {
      setupGraph({
        data: buildClippedSeries(),
        period: "1Y",
        benchmarks: ["nifty_smallcap_250"],
      });
      expect(chart.props!.secondSeries).toBeUndefined();
      expect(screen.getByTestId("benchmark-line").textContent).toContain("Nifty Smallcap 250 +0.76% since 01 Sep");
      expect(screen.getByTestId("wealth-note").textContent).toContain("Benchmark history starts on 01 Sep 2026.");
    });

    it("says when the benchmark has no data for the period and draws no benchmark", () => {
      const data = buildMonthlySeries();
      data.benchmark = {
        index: "nifty_50",
        label: "Nifty 50",
        available: false,
        pct: null,
        effective_start: null,
        clipped: false,
        points: [],
      };
      setupGraph({ data });
      expect(screen.queryByTestId("benchmark-line")).toBeNull();
      expect(chart.props!.secondSeries).toBeUndefined();
      expect(screen.getByTestId("wealth-note").textContent).toContain(
        "Benchmark data is not available for this period.",
      );
    });

    it("shows no benchmark line and no benchmark series when none was requested", () => {
      setupGraph({ data: buildOneDaySeries(), period: "1D", benchmarks: [] });
      expect(screen.queryByTestId("benchmark-line")).toBeNull();
      expect(chart.props!.secondSeries).toBeUndefined();
    });

    it("explains the two NAV days of a 1D view under the chart", () => {
      setupGraph({ data: buildOneDaySeries(), period: "1D", benchmarks: [] });
      expect(screen.getByTestId("wealth-note").textContent).toContain(
        "1D compares two NAV days (22 Oct and 23 Oct).",
      );
    });

    it("still draws a one-point series", () => {
      const data = buildOneDaySeries();
      data.points = data.points.slice(0, 1);
      setupGraph({ data, period: "1D", benchmarks: [] });
      expect(chart.props!.series[0].values).toHaveLength(1);
    });
  });

  describe("multi-benchmark wiring (D-6d)", () => {
    function buildMultiSeriesData(): WealthSeriesData {
      const base = buildMonthlySeries();
      return {
        ...base,
        benchmark_series: [
          {
            benchmark: "nifty_50",
            points: base.benchmark!.points,
            clipped: false,
            effective_start: "2026-09-23",
            available: true,
          },
          {
            benchmark: "nifty_500",
            points: [
              { date: "2026-10-01", pct: "0.0000" },
              { date: "2026-10-23", pct: "1.4500" },
            ],
            clipped: true,
            effective_start: "2026-10-01",
            available: true,
          },
          {
            benchmark: "nifty_smallcap_250",
            points: [],
            clipped: false,
            effective_start: null,
            available: false,
          },
        ],
      };
    }

    it("the checklist replaces the drop-down", () => {
      const onBenchmarksChange = vi.fn();
      setupGraph({
        benchmarks: ["nifty_50"],
        onBenchmarksChange,
      });

      expect(screen.queryByRole("combobox", { name: "Benchmark" })).toBeNull();
      const trigger = screen.getByRole("button", { name: /^Benchmark:\s*Nifty 50$/ });
      fireEvent.click(trigger);

      fireEvent.click(screen.getByRole("checkbox", { name: "Nifty 500" }));
      expect(onBenchmarksChange).toHaveBeenCalledWith(["nifty_50", "nifty_500"]);
    });

    it("legend chips follow the chosen list and hiding does not store anything", () => {
      localStorage.clear();
      const data = buildMultiSeriesData();
      setupGraph({
        data,
        benchmarks: ["nifty_50", "nifty_500"],
      });

      const chip50 = screen.getByTestId("legend-chip-nifty_50");
      const chip500 = screen.getByTestId("legend-chip-nifty_500");
      expect(chip50).toHaveAttribute("aria-pressed", "true");
      expect(chip500).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("legend-swatch-nifty_50")).toHaveStyle({
        backgroundColor: benchmarkColor("nifty_50"),
      });
      expect(screen.getByTestId("legend-swatch-nifty_500")).toHaveStyle({
        backgroundColor: benchmarkColor("nifty_500"),
      });
      expect(chart.props?.benchmarkLines?.map(line => line.id)).toEqual(["nifty_50", "nifty_500"]);

      fireEvent.click(chip500);
      expect(chip500).toHaveAttribute("aria-pressed", "false");
      expect(chart.props?.benchmarkLines?.map(line => line.id)).toEqual(["nifty_50"]);
      expect(localStorage.length).toBe(0);

      fireEvent.click(chip500);
      expect(chip500).toHaveAttribute("aria-pressed", "true");
      expect(chart.props?.benchmarkLines?.map(line => line.id)).toEqual(["nifty_50", "nifty_500"]);
    });

    it("the chart gets one line per available benchmark_series entry", () => {
      const data = buildMultiSeriesData();
      setupGraph({
        data,
        benchmarks: ["nifty_50", "nifty_500", "nifty_smallcap_250"],
      });

      expect(chart.props?.secondSeries).toBeUndefined();
      expect(chart.props?.dates).toEqual(data.points.map(point => point.date));
      expect(chart.props?.benchmarkLines).toEqual([
        {
          id: "nifty_50",
          label: "Nifty 50",
          color: benchmarkColor("nifty_50"),
          points: data.benchmark_series![0].points,
        },
        {
          id: "nifty_500",
          label: "Nifty 500",
          color: benchmarkColor("nifty_500"),
          points: data.benchmark_series![1].points,
        },
      ]);

      const note = screen.getByTestId("wealth-note").textContent ?? "";
      expect(note).toContain("Nifty 500 history starts on 01 Oct 2026.");
      expect(note).toContain("Nifty Smallcap 250 data is not available for this period.");
    });

    it("an old reply without benchmark_series still draws the single line", () => {
      const data = buildMonthlySeries();
      expect(data.benchmark_series).toBeUndefined();
      setupGraph({
        data,
        benchmarks: ["nifty_50"],
      });

      expect(chart.props?.benchmarkLines).toBeUndefined();
      expect(chart.props?.dates).toEqual(data.points.map(point => point.date));
      expect(chart.props?.secondSeries?.name).toBe("Nifty 50");
      expect(chart.props?.secondSeries?.color).toBe(benchmarkColor("nifty_50"));
      expect(chart.props?.secondSeries?.values).toHaveLength(31);
    });
  });

  it("WealthCard keeps the headline value and the hide-values button", () => {
    const onToggleHidden = vi.fn();
    const props: WealthCardProps = {
      status: "data",
      data: buildMonthlySeries(),
      scope: "aggregate",
      memberName: null,
      period: "1M",
      onPeriodChange: vi.fn(),
      customRange: { from: null, to: null },
      onCustomRangeChange: vi.fn(),
      today: "2026-10-23",
      benchmarkOptions: BENCHMARK_OPTIONS,
      benchmarks: ["nifty_50"],
      onBenchmarksChange: vi.fn(),
      hidden: false,
      onToggleHidden,
      onRetry: vi.fn(),
      onImport: vi.fn(),
    };

    const { container, rerender } = render(<WealthCard {...props} />);
    const card = container.firstElementChild as HTMLElement;
    expect(screen.getByTestId("wealth-caption").textContent).toBe("Your family's wealth");
    expect(screen.getByTestId("wealth-total").textContent).toBe("₹5,212");
    expect(screen.getByTestId("change-badge").textContent).toBe("▲ +₹116 (+2.28%)");
    expect(screen.getByRole("button", { name: "Hide values" })).toBeInTheDocument();
    expect(within(card).getByTestId("line-chart")).toBeInTheDocument();

    rerender(<WealthCard {...props} hidden={true} />);
    expect(screen.getByTestId("wealth-total").textContent).toBe("••••••");
    expect(screen.getByTestId("change-badge").textContent).toBe("••••••");
    expect(screen.getByTestId("benchmark-line").textContent).toContain("Nifty 50");
    expect(chart.props?.formatValue(5212)).toBe("••••••");
    fireEvent.click(screen.getByRole("button", { name: "Show values" }));
    expect(onToggleHidden).toHaveBeenCalledTimes(1);
  });
});

describe("useWealthSeries", () => {
  const AGGREGATE: WealthScope = { viewMode: "aggregate", memberId: null };
  const MEMBER: WealthScope = { viewMode: "member", memberId: "m-1" };

  it("fetches the wealth-series route sending both benchmark and benchmarks in order", async () => {
    const data = buildMonthlySeries();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useWealthSeries(AGGREGATE, "1M", null, ["nifty_50", "nifty_500"]),
    );

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data).toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/household/aggregate/home/wealth-series?period=1M&benchmark=nifty_50&benchmarks=nifty_50&benchmarks=nifty_500`,
    );
  });

  it("uses a caller-supplied loadSeries function and forwards scope, query and abort signal", async () => {
    const data = buildMonthlySeries();
    const calls: Array<{ scope: WealthScope; query: WealthSeriesQuery; signal?: AbortSignal }> = [];
    const loadSeries = vi.fn(async (scope: WealthScope, query: WealthSeriesQuery, signal?: AbortSignal) => {
      calls.push({ scope, query, signal });
      return data;
    });

    const { result } = renderHook(() =>
      useWealthSeries(MEMBER, "custom", { from: "2026-10-01", to: "2026-10-10" }, ["nifty_midcap_150"], {
        loadSeries,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(calls).toHaveLength(1);
    expect(calls[0].scope).toEqual(MEMBER);
    expect(calls[0].query).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-10",
      benchmark: "nifty_midcap_150",
      benchmarks: ["nifty_midcap_150"],
    });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("does not request while disabled or while a custom range is incomplete", () => {
    const loadSeries = vi.fn().mockResolvedValue(buildMonthlySeries());

    const disabled = renderHook(() =>
      useWealthSeries(AGGREGATE, "1M", null, ["nifty_50"], { loadSeries, enabled: false }),
    );
    expect(disabled.result.current.status).toBe("loading");
    expect(loadSeries).not.toHaveBeenCalled();
    disabled.unmount();

    const incomplete = renderHook(() =>
      useWealthSeries(AGGREGATE, "custom", { from: "2026-10-01", to: null }, ["nifty_50"], { loadSeries }),
    );
    expect(incomplete.result.current.status).toBe("loading");
    expect(loadSeries).not.toHaveBeenCalled();
  });

  it("keeps stale data while refreshing in the same scope and resets to loading on scope change", async () => {
    const first = buildMonthlySeries();
    const second = deferred<WealthSeriesData>();
    const third = deferred<WealthSeriesData>();
    const loadSeries = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);

    const { result, rerender } = renderHook(
      ({ scope, period }: { scope: WealthScope; period: "1M" | "1W" }) =>
        useWealthSeries(scope, period, null, ["nifty_50"], { loadSeries }),
      { initialProps: { scope: AGGREGATE, period: "1M" as "1M" | "1W" } },
    );

    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.refreshing).toBe(false);

    rerender({ scope: AGGREGATE, period: "1W" });
    expect(result.current.status).toBe("data");
    expect(result.current.data).toEqual(first);
    expect(result.current.refreshing).toBe(true);

    rerender({ scope: MEMBER, period: "1W" });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();
    expect(result.current.refreshing).toBe(false);

    const memberData = buildOneDaySeries();
    await act(async () => {
      third.resolve(memberData);
    });
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data).toEqual(memberData);
  });

  it("reports an error and retries when retry is called", async () => {
    const data = buildMonthlySeries();
    const loadSeries = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(data);

    const { result } = renderHook(() =>
      useWealthSeries(AGGREGATE, "1M", null, [], { loadSeries }),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeNull();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("data"));
    expect(result.current.data).toEqual(data);
    expect(loadSeries).toHaveBeenCalledTimes(2);
  });
});

describe("components/wealth-graph import boundary", () => {
  it("never imports from features/* in any non-test source file", () => {
    const dir = resolve("src/components/wealth-graph");
    const sourceFiles = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      .map(entry => join(dir, entry.name));

    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf8");
      if (/from\s+["'](?:@\/|\.\.\/)*features\//.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
