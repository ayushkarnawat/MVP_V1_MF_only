import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MainDashboardFlow } from "./MainDashboardFlow";
import * as authApi from "../auth/api";
import * as dashboardApi from "./api";

vi.mock("../auth/api", () => ({
  getHouseholdMembers: vi.fn(),
}));

vi.mock("./api", () => ({
  getMemberHoldings: vi.fn(),
  getMemberAllocation: vi.fn(),
  getAggregateHoldings: vi.fn(),
  getAggregateAllocation: vi.fn(),
  getDistributorComparison: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    me: { user_id: "u-1", phone_number: "+919999999999" },
    loading: false,
  }),
}));

describe("MainDashboardFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches household members and defaults landing view", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", user_id: "u-1", name: "Alice", relationship: "self", relationship_other_label: null, created_at: "" },
      { id: "m-2", user_id: "u-1", name: "Bob", relationship: "spouse", relationship_other_label: null, created_at: "" },
    ]);

    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      holdings: [],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" },
    });

    render(<MainDashboardFlow />);

    await waitFor(() => {
      expect(screen.getByText("Unifolio")).toBeInTheDocument();
      expect(screen.getByText("Family Combined")).toBeInTheDocument();
    });
  });
});
