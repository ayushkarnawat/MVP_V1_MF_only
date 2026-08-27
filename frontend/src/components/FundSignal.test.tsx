import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundSignal, FundSignalGraph } from "./FundSignal";
import * as api from "../features/dashboard/api";
import type { SchemeNavHistoryResponse } from "../features/dashboard/types";

vi.mock("../features/dashboard/api", () => ({
  getFundNavHistory: vi.fn(),
}));

const historyResponse = {
  scheme_id: "scheme-42",
  period: "1Y",
  requested_period: "1Y",
  clamped: false,
  points: [
    { date: "2025-08-25", nav: "100.0000", return_pct: "0.00" },
    { date: "2026-08-25", nav: "115.2000", return_pct: "15.20" },
  ],
  overall_return_pct: "15.20",
} satisfies SchemeNavHistoryResponse;

describe("FundSignal", () => {
  it("renders positive return arc and icon", () => {
    render(<FundSignal returnPercentage={12.5} schemeName="Axis Small Cap" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("gain of 12.5%"),
    );
  });

  it("renders negative return arc and icon", () => {
    render(<FundSignal returnPercentage={-4.2} schemeName="HDFC Top 100" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("loss of 4.2%"),
    );
  });
});

describe("FundSignalGraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFundNavHistory).mockResolvedValue(historyResponse);
  });

  it("refetches with the selected period", async () => {
    render(<FundSignalGraph schemeId="scheme-42" />);
    await screen.findByText("Aug 25, 2026: +15.20%");

    fireEvent.click(screen.getByRole("button", { name: "5Y" }));

    await waitFor(() => {
      expect(api.getFundNavHistory).toHaveBeenLastCalledWith(
        "scheme-42",
        "5Y",
        expect.any(AbortSignal),
      );
    });
    expect(screen.getByText("Trend (5Y)")).toBeInTheDocument();
  });

  it("shows the shared chart-sized skeleton while loading", () => {
    vi.mocked(api.getFundNavHistory).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<FundSignalGraph schemeId="scheme-42" />);

    expect(container.querySelector('[style*="height: 96px"]')).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the error fallback", async () => {
    vi.mocked(api.getFundNavHistory).mockRejectedValue(new Error(""));
    render(<FundSignalGraph schemeId="scheme-42" />);

    expect(await screen.findByText("Failed to load performance history")).toBeInTheDocument();
  });

  it("renders the empty state instead of an empty chart", async () => {
    vi.mocked(api.getFundNavHistory).mockResolvedValue({
      ...historyResponse,
      points: [],
      overall_return_pct: null,
    });
    const { container } = render(<FundSignalGraph schemeId="scheme-42" />);

    expect(await screen.findByText("No performance history available yet.")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the clamped-to-full-history note", async () => {
    vi.mocked(api.getFundNavHistory).mockResolvedValue({
      ...historyResponse,
      period: "MAX",
      requested_period: "5Y",
      clamped: true,
    });
    render(<FundSignalGraph schemeId="scheme-42" period="5Y" />);

    expect(
      await screen.findByText("Showing full history since inception — not enough data for 5Y"),
    ).toBeInTheDocument();
  });

  it("updates the readout when a point is hovered", async () => {
    render(<FundSignalGraph schemeId="scheme-42" />);
    await screen.findByText("Aug 25, 2026: +15.20%");

    fireEvent.mouseEnter(screen.getByLabelText("Aug 25, 2025: 0.00%"));

    expect(screen.getByText("Aug 25, 2025: 0.00%")).toBeInTheDocument();
  });
});
