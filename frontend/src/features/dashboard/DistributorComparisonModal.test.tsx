import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DistributorComparisonModal } from "./DistributorComparisonModal";
import * as api from "./api";

vi.mock("./api", () => ({
  getDistributorComparison: vi.fn(),
}));

describe("DistributorComparisonModal", () => {
  it("renders distributor comparison table when modal is open", async () => {
    vi.mocked(api.getDistributorComparison).mockResolvedValue([
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
      <DistributorComparisonModal
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
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    });
  });
});
