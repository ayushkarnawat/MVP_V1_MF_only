import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DistributorComparisonModal } from "./DistributorComparisonModal";
import * as api from "./api";

vi.mock("./api", () => ({
  getMemberDistributorComparison: vi.fn(),
  getAggregateDistributorComparison: vi.fn(),
}));

const directRow = {
  arn_code: null,
  distributor_name: null,
  arn_status: null,
  amount_invested: "5000.00",
  current_value: "7500.00",
  current_profit_total: "2500.00",
  realized_gain: "0.00",
  unrealized_gain: "2500.00",
  schemes: [
    {
      scheme_id: "s-1",
      scheme_name: "PPFAS Flexi Cap Fund",
      household_member_id: "m-1",
      household_member_name: "Ayush",
      units_held: "100.00",
      average_nav: "50.00",
      amount_invested: "5000.00",
      current_value: "7500.00",
      current_profit_total: "2500.00",
      realized_gain: "0.00",
      unrealized_gain: "2500.00",
    },
  ],
};

const brokeredRow = {
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

describe("DistributorComparisonModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the member-scoped endpoint in member view", async () => {
    vi.mocked(api.getMemberDistributorComparison).mockResolvedValue([directRow, brokeredRow]);

    render(
      <DistributorComparisonModal isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(api.getMemberDistributorComparison).toHaveBeenCalledWith("m-1", expect.anything());
      expect(screen.getByText("Direct Plan (No Broker)")).toBeInTheDocument();
      expect(screen.getByText("ABC Wealth")).toBeInTheDocument();
    });
    expect(api.getAggregateDistributorComparison).not.toHaveBeenCalled();
  });

  it("fetches the aggregate endpoint in aggregate view", async () => {
    vi.mocked(api.getAggregateDistributorComparison).mockResolvedValue({
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
      rows: [directRow],
    });

    render(
      <DistributorComparisonModal isOpen={true} onClose={vi.fn()} viewMode="aggregate" memberId={null} />
    );

    await waitFor(() => {
      expect(api.getAggregateDistributorComparison).toHaveBeenCalled();
      expect(screen.getByText("Direct Plan (No Broker)")).toBeInTheDocument();
    });
    expect(api.getMemberDistributorComparison).not.toHaveBeenCalled();
  });

  it("does not render a scheme breakdown row until the distributor row is expanded", async () => {
    vi.mocked(api.getMemberDistributorComparison).mockResolvedValue([brokeredRow]);

    render(
      <DistributorComparisonModal isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
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

  it("shows the empty state when there are no rows", async () => {
    vi.mocked(api.getMemberDistributorComparison).mockResolvedValue([]);

    render(
      <DistributorComparisonModal isOpen={true} onClose={vi.fn()} viewMode="member" memberId="m-1" />
    );

    await waitFor(() => {
      expect(screen.getByText("No distributor comparison data found.")).toBeInTheDocument();
    });
  });
});
