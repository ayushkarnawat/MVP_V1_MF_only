import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFundDetailView } from "./MobileFundDetailView";
import type { HoldingRow, SchemeNavHistoryResponse } from "@/features/dashboard/types";
import { getFundNavHistory } from "@/features/dashboard/api";

vi.mock("@/features/dashboard/api", () => ({ getFundNavHistory: vi.fn() }));

const historyResponse: SchemeNavHistoryResponse = {
  scheme_id: "scheme-101",
  period: "1Y",
  requested_period: "1Y",
  clamped: false,
  points: [
    { date: "2025-01-15", nav: "45.5000", return_pct: "0.00" },
    { date: "2026-08-25", nav: "60.0000", return_pct: "31.87" },
  ],
  overall_return_pct: "31.87",
};

describe("MobileFundDetailView", () => {
  const sampleHolding: HoldingRow = {
    scheme_id: "scheme-101",
    scheme_name: "Axis Bluechip Fund",
    amc_name: "Axis Mutual Fund",
    household_member_id: "m-1",
    household_member_name: "Ayush",
    plan_type: "DIRECT",
    units_held: "123.456",
    average_nav: "45.50",
    current_nav: "60.00",
    current_nav_date: "2026-08-10",
    amount_invested: "5617.25",
    current_value: "7407.36",
    current_profit_total: "1790.11",
    realized_gain: "0.00",
    unrealized_gain: "1790.11",
    today_gain: "15.00",
    category: "Large Cap Equity",
  };

  beforeEach(() => {
    vi.mocked(getFundNavHistory).mockReset();
    vi.mocked(getFundNavHistory).mockResolvedValue(historyResponse);
  });

  it("renders full holding financial breakdown and performance chart", async () => {
    const handleBack = vi.fn();
    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={handleBack}
      />
    );

    expect(screen.getByText("FUND DETAILS")).toBeInTheDocument();
    expect(screen.getByText("Axis Bluechip Fund")).toBeInTheDocument();
    expect(screen.getAllByText("Axis Mutual Fund").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Direct").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ayush")).toBeInTheDocument();
    expect(screen.getByText("Large Cap Equity")).toBeInTheDocument();
    expect(screen.getAllByText("Current Value").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Invested")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("1Y")).toBeInTheDocument();
    expect(await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%")).toBeInTheDocument();
    expect(screen.getByText("31.87%")).toBeInTheDocument();
    expect(screen.getByText("Units")).toBeInTheDocument();
    expect(screen.getByText("123.456")).toBeInTheDocument();
    expect(screen.getByText("Avg NAV")).toBeInTheDocument();
    expect(screen.getAllByText(/45.50/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Current NAV")).toBeInTheDocument();
    expect(screen.getAllByText(/60.00/i).length).toBeGreaterThanOrEqual(1);

    // Trigger back
    const backBtn = screen.getByLabelText("Back to holdings");
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("refetches performance history when a timeframe pill is clicked", async () => {
    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => expect(getFundNavHistory).toHaveBeenCalledWith("scheme-101", "1Y", expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: "5Y" }));
    await waitFor(() => expect(getFundNavHistory).toHaveBeenLastCalledWith("scheme-101", "5Y", expect.any(AbortSignal)));
    expect(screen.getByRole("button", { name: "5Y" })).toHaveClass("bg-[var(--color-surface)]");
  });

  it("shows a shared skeleton while performance history is loading", () => {
    vi.mocked(getFundNavHistory).mockReturnValue(new Promise(() => {}));
    const { container } = render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    expect(container.querySelector('[style*="height: 150px"]')).toBeInTheDocument();
    expect(container.querySelector("svg polyline")).not.toBeInTheDocument();
  });

  it("shows an error in the chart note treatment", async () => {
    vi.mocked(getFundNavHistory).mockRejectedValue(new Error("NAV service unavailable"));
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    expect(await screen.findByText("NAV service unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/portfolio baseline trajectory/i)).not.toBeInTheDocument();
  });

  it("shows the empty state when no history is available", async () => {
    vi.mocked(getFundNavHistory).mockResolvedValue({ ...historyResponse, points: [], overall_return_pct: null });
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    expect(await screen.findByText("No performance history available yet.")).toBeInTheDocument();
  });

  it("shows the requested period in the clamped-to-MAX note", async () => {
    vi.mocked(getFundNavHistory).mockResolvedValue({ ...historyResponse, period: "MAX", requested_period: "5Y", clamped: true });
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    expect(await screen.findByText("Showing full history since inception — not enough data for 5Y")).toBeInTheDocument();
  });

  it("updates the readout via keyboard navigation on the chart scrubber", async () => {
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });

    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "15 Jan: 0.00%")).toBeInTheDocument();
  });

  it("updates the readout when scrubbing across the chart with a pointer", async () => {
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");

    const scrubber = screen.getByRole("slider");
    vi.spyOn(scrubber, "getBoundingClientRect").mockReturnValue({
      width: 320,
      left: 0,
      right: 320,
      top: 0,
      bottom: 140,
      height: 140,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect);

    fireEvent.pointerMove(scrubber, { clientX: 0 });

    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "15 Jan: 0.00%")).toBeInTheDocument();
  });

  it("resolves an interior pointer position to the correct point, not just an endpoint", async () => {
    // Endpoint-only assertions (clientX 0) can't catch a broken padding/scale in the
    // pointer-to-index inversion — an interior point exercises the full formula.
    vi.mocked(getFundNavHistory).mockResolvedValue({
      ...historyResponse,
      points: [
        { date: "2025-01-15", nav: "45.5000", return_pct: "0.00" },
        { date: "2025-09-20", nav: "52.1000", return_pct: "14.50" },
        { date: "2026-08-25", nav: "60.0000", return_pct: "31.87" },
      ],
    });
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");

    const scrubber = screen.getByRole("slider");
    vi.spyOn(scrubber, "getBoundingClientRect").mockReturnValue({
      width: 320,
      left: 0,
      right: 320,
      top: 0,
      bottom: 140,
      height: 140,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect);

    // Middle point (index 1 of 3) sits at viewBox x=160 given PADDING_X=16, SVG_WIDTH=320.
    fireEvent.pointerMove(scrubber, { clientX: 160 });

    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "20 Sept: 14.50%")).toBeInTheDocument();
  });

  it("updates the readout on a touch tap without requiring a drag", async () => {
    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");

    const scrubber = screen.getByRole("slider");
    vi.spyOn(scrubber, "getBoundingClientRect").mockReturnValue({
      width: 320,
      left: 0,
      right: 320,
      top: 0,
      bottom: 140,
      height: 140,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    } as DOMRect);

    fireEvent.pointerDown(scrubber, { clientX: 0, pointerType: "touch" });

    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === "15 Jan: 0.00%")).toBeInTheDocument();
  });

  it("clears the previous timeframe's readout while a new one is loading", async () => {
    let resolveNext: (value: SchemeNavHistoryResponse) => void = () => undefined;
    const nextPromise = new Promise<SchemeNavHistoryResponse>((resolve) => {
      resolveNext = resolve;
    });

    render(<MobileFundDetailView holding={sampleHolding} onBack={vi.fn()} />);
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");

    vi.mocked(getFundNavHistory).mockReturnValue(nextPromise);
    fireEvent.click(screen.getByRole("button", { name: "5Y" }));

    // Stale 1Y readout must not linger while the 5Y request is in flight.
    expect(screen.queryByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%")).not.toBeInTheDocument();

    resolveNext({ ...historyResponse, period: "5Y", requested_period: "5Y" });
    await screen.findByText((_, element) => element?.tagName === "SPAN" && element.textContent === "25 Aug: 31.87%");
  });

  it("resets scroll container scrollTop to 0 when mounted inside a scrolled container", () => {
    const parentContainer = document.createElement("div");
    parentContainer.scrollTop = 450;
    document.body.appendChild(parentContainer);

    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />,
      { container: parentContainer }
    );

    expect(parentContainer.scrollTop).toBe(0);
    document.body.removeChild(parentContainer);
  });

  it("resets scroll container scrollTop to 0 when switching holdings", () => {
    const parentContainer = document.createElement("div");
    parentContainer.scrollTop = 300;
    document.body.appendChild(parentContainer);

    const { rerender } = render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />,
      { container: parentContainer }
    );

    expect(parentContainer.scrollTop).toBe(0);

    // Simulate user scrolling inside the view
    parentContainer.scrollTop = 500;
    expect(parentContainer.scrollTop).toBe(500);

    // Rerender with another holding
    const anotherHolding: HoldingRow = {
      ...sampleHolding,
      scheme_id: "scheme-102",
      scheme_name: "HDFC Top 100 Fund",
    };

    rerender(
      <MobileFundDetailView
        holding={anotherHolding}
        onBack={vi.fn()}
      />
    );

    expect(parentContainer.scrollTop).toBe(0);
    expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
    document.body.removeChild(parentContainer);
  });
});
