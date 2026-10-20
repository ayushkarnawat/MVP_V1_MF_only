import * as dashboardApi from "../dashboard/api";
import type { MonthDetail } from "../dashboard/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as historyApi from "./api";
import { HistoryView } from "./HistoryView";

vi.mock("../dashboard/api", () => ({ getMemberMonthDetail: vi.fn(), getAggregateMonthDetail: vi.fn() }));

vi.mock("./api", () => ({ fetchHistory: vi.fn() }));

const pt = (month: string, value: number, partial = false, missing: string[] = []) =>
  ({ month, value, invested: value - 10, valueText: String(value), investedText: String(value - 10), partial, missing });

describe("HistoryView", () => {
  it("renders the title, points and marks partial months", async () => {
    vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100), pt("2024-02-29", 110, true, ["HDFC Liquid"])]);
    render(<HistoryView viewMode="member" memberId="m1" memberName="Neha" />);
    expect(await screen.findByText("Portfolio history")).toBeInTheDocument();
    expect(screen.getByText("Neha · monthly value at each month-end")).toBeInTheDocument();
    // Screen readers can't reach text inside an svg role="img", so the
    // partial months are also listed outside it (6B review #9).
    const list = screen.getByRole("list", { name: "Months with a missing price" });
    expect(list).toHaveTextContent("Feb 2024: HDFC Liquid had no price this month");
    expect(screen.getByText(/History starts Jan 2024/)).toBeInTheDocument();
  });

  it("family view says Family", async () => {
    vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100)]);
    render(<HistoryView viewMode="aggregate" memberId={null} />);
    expect(await screen.findByText("Family · monthly value at each month-end")).toBeInTheDocument();
  });

  it("range chip filters to the last year", async () => {
    const points = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 4 + i + 1, 0));      // month-ends May 2023 … Oct 2025
      return pt(d.toISOString().slice(0, 10), 100 + i);
    });
    vi.mocked(historyApi.fetchHistory).mockResolvedValue(points);
    render(<HistoryView viewMode="member" memberId="m1" memberName="Neha" />);
    await screen.findByText("Portfolio history");
    const chart = await screen.findByRole("img", { name: "Portfolio value by month" });
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("May 2023");
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Nov 2024");
  });

  it("shows the updating state while loading and an empty state without data", async () => {
    let resolve: (v: ReturnType<typeof pt>[]) => void = () => {};
    vi.mocked(historyApi.fetchHistory).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<HistoryView viewMode="member" memberId="m1" memberName="Neha" />);
    expect(screen.getByText("Updating history…")).toBeInTheDocument();
    resolve([]);
    expect(await screen.findByText(/No history yet/)).toBeInTheDocument();
  });
});


const loadedMonth: MonthDetail = { month: "2024-01-31", previous_month: null, total_value: "100.00", previous_value: "0.00", change: "100.00", new_money: "100.00", market_movement: "0.00", switched_in: "0.00", switched_out: "0.00", is_partial: false, missing_scheme_names: [], funds: [] };
it("shows month loading, then the fetched detail, and closes on Escape", async () => {
  vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100)]);
  let resolve!: (value: MonthDetail) => void;
  vi.mocked(dashboardApi.getMemberMonthDetail).mockReturnValue(new Promise(r => { resolve = r; }));
  render(<HistoryView viewMode="member" memberId="m1" />);
  fireEvent.keyDown(await screen.findByRole("img"), { key: "Enter" });
  expect(screen.getByRole("status")).toHaveTextContent("Loading month…");
  resolve(loadedMonth);
  expect(await screen.findByText("Change this month")).toBeInTheDocument();
  expect(dashboardApi.getMemberMonthDetail).toHaveBeenCalledWith("m1", "2024-01-31", expect.any(AbortSignal));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows an error and retry, using the aggregate endpoint for family view", async () => {
  vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100)]);
  vi.mocked(dashboardApi.getAggregateMonthDetail).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(loadedMonth);
  render(<HistoryView viewMode="aggregate" memberId={null} />);
  fireEvent.keyDown(await screen.findByRole("img"), { key: "Enter" });
  expect(await screen.findByText("Couldn't load this month. Try again.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Change this month")).toBeInTheDocument();
});


it("reopening a month shows loading rather than a stale previous detail", async () => {
  vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100)]);
  vi.mocked(dashboardApi.getMemberMonthDetail).mockResolvedValueOnce(loadedMonth).mockReturnValueOnce(new Promise(() => {}));
  render(<HistoryView viewMode="member" memberId="m1" />);
  const chart = await screen.findByRole("img");
  fireEvent.keyDown(chart, { key: "Enter" });
  await screen.findByText("Change this month");
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.keyDown(chart, { key: "Enter" });
  expect(screen.getByRole("status")).toHaveTextContent("Loading month…");
  expect(screen.queryByText("Change this month")).not.toBeInTheDocument();
});

it("changing member closes the old selection without fetching its month in the new scope", async () => {
  vi.mocked(historyApi.fetchHistory).mockResolvedValue([pt("2024-01-31", 100)]);
  vi.mocked(dashboardApi.getMemberMonthDetail).mockClear().mockResolvedValue(loadedMonth);
  const { rerender } = render(<HistoryView viewMode="member" memberId="m1" />);
  fireEvent.keyDown(await screen.findByRole("img"), { key: "Enter" });
  await screen.findByText("Change this month");
  rerender(<HistoryView viewMode="member" memberId="m2" />);
  await screen.findByRole("img");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(dashboardApi.getMemberMonthDetail).not.toHaveBeenCalledWith("m2", "2024-01-31", expect.any(AbortSignal));
});
