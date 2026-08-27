import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundDetailModal } from "./FundDetailModal";
import type { HoldingRow } from "./types";
import * as api from "./api";

vi.mock("./api", () => ({
  getFundNavHistory: vi.fn(),
}));

describe("FundDetailModal", () => {
  beforeEach(() => {
    vi.mocked(api.getFundNavHistory).mockResolvedValue({
      scheme_id: "scheme-42",
      period: "1Y",
      requested_period: "1Y",
      clamped: false,
      points: [],
      overall_return_pct: null,
    });
  });

  const sampleHolding: HoldingRow = {
    scheme_id: "scheme-42",
    scheme_name: "PPFAS Flexi Cap Fund",
    amc_name: "PPFAS Mutual Fund",
    household_member_id: "m-1",
    household_member_name: "Ayush",
    plan_type: "DIRECT",
    units_held: "150.250",
    average_nav: "42.50",
    current_nav: "65.80",
    current_nav_date: "2026-08-06",
    amount_invested: "6385.63",
    current_value: "9886.45",
    current_profit_total: "3500.82",
    realized_gain: "0.00",
    unrealized_gain: "3500.82",
    today_gain: "45.00",
  };

  it("renders scheme details and financial metrics when modal is open", () => {
    render(
      <FundDetailModal
        isOpen={true}
        onClose={vi.fn()}
        holding={sampleHolding}
      />
    );

    expect(screen.getByText("PPFAS Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("PPFAS Mutual Fund")).toBeInTheDocument();
    expect(screen.getByText("₹9,886")).toBeInTheDocument();
    expect(screen.getByText("₹6,386")).toBeInTheDocument();
    expect(screen.getByText("150.250")).toBeInTheDocument();
  });

  it("no longer renders a Compare Distributors trigger — moved to the Holdings section header", () => {
    render(
      <FundDetailModal isOpen={true} onClose={vi.fn()} holding={sampleHolding} />
    );

    expect(
      screen.queryByRole("button", { name: /compare returns by distributor/i })
    ).not.toBeInTheDocument();
  });

  it("wires the holding's scheme id into the performance graph's real data fetch", async () => {
    vi.mocked(api.getFundNavHistory).mockResolvedValue({
      scheme_id: "scheme-42",
      period: "1Y",
      requested_period: "1Y",
      clamped: false,
      points: [{ date: "2026-08-25", nav: "65.80", return_pct: "12.34" }],
      overall_return_pct: "12.34",
    });

    render(<FundDetailModal isOpen={true} onClose={vi.fn()} holding={sampleHolding} />);

    expect(await screen.findByText("+12.34%")).toBeInTheDocument();
    expect(api.getFundNavHistory).toHaveBeenCalledWith(
      "scheme-42",
      "1Y",
      expect.any(AbortSignal),
    );
  });
});
