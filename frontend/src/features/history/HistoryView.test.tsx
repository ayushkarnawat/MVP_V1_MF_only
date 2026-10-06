import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as historyApi from "./api";
import { HistoryView } from "./HistoryView";

vi.mock("./api", () => ({ fetchHistory: vi.fn() }));

const pt = (month: string, value: number, partial = false, missing: string[] = []) =>
  ({ month, value, invested: value - 10, partial, missing });

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
    const { container } = render(<HistoryView viewMode="member" memberId="m1" memberName="Neha" />);
    await screen.findByText("Portfolio history");
    expect(container.querySelectorAll("[data-point]").length).toBe(30);
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(container.querySelectorAll("[data-point]").length).toBe(12);
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
