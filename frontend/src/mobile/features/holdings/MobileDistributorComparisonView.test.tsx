import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileDistributorComparisonView } from "./MobileDistributorComparisonView";
import * as dashboardApi from "@/features/dashboard/api";

vi.mock("@/features/dashboard/api", () => ({
  getDistributorComparison: vi.fn(),
}));

describe("MobileDistributorComparisonView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders distributor comparison rows from a fetched response", async () => {
    vi.mocked(dashboardApi.getDistributorComparison).mockResolvedValue([
      {
        arn_code: null,
        distributor_name: null,
        arn_status: null,
        units_held: "100.00",
        average_nav: "50.00",
        amount_invested: "5000.00",
        current_value: "7500.00",
        current_profit_total: "2500.00",
        realized_gain: "0.00",
        unrealized_gain: "2500.00",
      },
      {
        arn_code: "ARN-12345",
        distributor_name: "ABC Wealth",
        arn_status: "ACTIVE",
        units_held: "50.00",
        average_nav: "52.00",
        amount_invested: "2600.00",
        current_value: "3750.00",
        current_profit_total: "1150.00",
        realized_gain: "0.00",
        unrealized_gain: "1150.00",
      },
    ]);

    render(
      <MobileDistributorComparisonView
        isOpen={true}
        onClose={vi.fn()}
        memberId="m-1"
        schemeId="s-1"
        schemeName="Mirae Asset Large Cap"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Mirae Asset Large Cap")).toBeInTheDocument();
      expect(screen.getByText("Direct Plan (No Broker)")).toBeInTheDocument();
      expect(screen.getByText("ABC Wealth")).toBeInTheDocument();
      expect(screen.getByText("ARN: ARN-12345")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("₹5,000")).toBeInTheDocument();
      expect(screen.getByText("₹7,500")).toBeInTheDocument();
      expect(screen.getByText("↑ ₹2,500")).toBeInTheDocument();
    });

    expect(dashboardApi.getDistributorComparison).toHaveBeenCalledWith("m-1", "s-1");
  });

  it("shows the empty state when the API returns no rows", async () => {
    vi.mocked(dashboardApi.getDistributorComparison).mockResolvedValue([]);

    render(
      <MobileDistributorComparisonView
        isOpen={true}
        onClose={vi.fn()}
        memberId="m-1"
        schemeId="s-1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("No distributor comparison data found.")
      ).toBeInTheDocument();
    });
  });

  it("calls onClose when the back button is clicked", async () => {
    vi.mocked(dashboardApi.getDistributorComparison).mockResolvedValue([]);
    const handleClose = vi.fn();

    render(
      <MobileDistributorComparisonView
        isOpen={true}
        onClose={handleClose}
        memberId="m-1"
        schemeId="s-1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("No distributor comparison data found.")
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Back to fund details"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
