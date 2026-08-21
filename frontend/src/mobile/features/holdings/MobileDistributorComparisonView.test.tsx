import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileDistributorComparisonView } from "./MobileDistributorComparisonView";
import * as dashboardApi from "@/features/dashboard/api";
import type { DistributorPortfolioRow } from "@/features/dashboard/types";

vi.mock("@/features/dashboard/api", () => ({
  getMemberDistributorComparison: vi.fn(),
  getAggregateDistributorComparison: vi.fn(),
}));

const brokeredRow: DistributorPortfolioRow = {
  arn_code: "ARN-12345",
  distributor_name: "ABC Wealth",
  arn_status: "ACTIVE",
  amount_invested: "2600.00",
  current_value: "3750.00",
  current_profit_total: "1150.00",
  realized_gain: "0.00",
  unrealized_gain: "1150.00",
  schemes: [
    {
      scheme_id: "s-2",
      scheme_name: "Mirae Asset Large Cap",
      household_member_id: "m-1",
      household_member_name: "Ayush",
      units_held: "50.00",
      average_nav: "52.00",
      amount_invested: "2600.00",
      current_value: "3750.00",
      current_profit_total: "1150.00",
      realized_gain: "0.00",
      unrealized_gain: "1150.00",
    },
  ],
};

describe("MobileDistributorComparisonView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the member-scoped endpoint and renders distributor cards", async () => {
    vi.mocked(dashboardApi.getMemberDistributorComparison).mockResolvedValue([brokeredRow]);

    render(
      <MobileDistributorComparisonView isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(screen.getByText("ARN: ARN-12345")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("₹2,600")).toBeInTheDocument();
      expect(screen.getByText("₹3,750")).toBeInTheDocument();
      expect(screen.getByText("↑ ₹1,150")).toBeInTheDocument();
    });

    expect(dashboardApi.getMemberDistributorComparison).toHaveBeenCalledWith("m-1", expect.anything());
  });

  it("fetches the aggregate endpoint in aggregate view", async () => {
    vi.mocked(dashboardApi.getAggregateDistributorComparison).mockResolvedValue({
      members: [],
      rows: [brokeredRow],
    });

    render(
      <MobileDistributorComparisonView isOpen={true} onClose={vi.fn()} viewMode="aggregate" memberId={null} />
    );

    await waitFor(() => {
      expect(dashboardApi.getAggregateDistributorComparison).toHaveBeenCalled();
      expect(screen.getByText("ABC Wealth")).toBeInTheDocument();
    });
  });

  it("expands a distributor card to reveal its scheme breakdown", async () => {
    vi.mocked(dashboardApi.getMemberDistributorComparison).mockResolvedValue([brokeredRow]);

    render(
      <MobileDistributorComparisonView isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(screen.getByText("ABC Wealth")).toBeInTheDocument();
    });
    expect(screen.queryByText("Mirae Asset Large Cap")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("ABC Wealth"));

    await waitFor(() => {
      expect(screen.getByText("Mirae Asset Large Cap")).toBeInTheDocument();
    });
  });

  it("shows the empty state when the API returns no rows", async () => {
    vi.mocked(dashboardApi.getMemberDistributorComparison).mockResolvedValue([]);

    render(
      <MobileDistributorComparisonView isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(screen.getByText("No distributor comparison data found.")).toBeInTheDocument();
    });
  });

  it("calls onClose when the back button is clicked", async () => {
    vi.mocked(dashboardApi.getMemberDistributorComparison).mockResolvedValue([]);
    const handleClose = vi.fn();

    render(
      <MobileDistributorComparisonView isOpen={true} onClose={handleClose} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(screen.getByText("No distributor comparison data found.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Back to holdings"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
