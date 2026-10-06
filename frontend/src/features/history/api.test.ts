import { describe, expect, it, vi } from "vitest";
import * as dashboardApi from "../dashboard/api";
import { fetchHistory } from "./api";

vi.mock("../dashboard/api", () => ({ getMemberSnapshots: vi.fn(), getAggregateSnapshots: vi.fn() }));

describe("fetchHistory", () => {
  it("member view returns that member's months in order", async () => {
    vi.mocked(dashboardApi.getMemberSnapshots).mockResolvedValue([
      { household_member_id: "m1", household_member_name: "Neha", snapshot_month: "2024-02-29", total_value: "110", invested_value: "95", is_partial: true, missing_scheme_names: ["HDFC Liquid"] },
      { household_member_id: "m1", household_member_name: "Neha", snapshot_month: "2024-01-31", total_value: "100", invested_value: "90", is_partial: false, missing_scheme_names: [] },
    ]);
    const points = await fetchHistory("member", "m1");
    expect(points.map((p) => p.month)).toEqual(["2024-01-31", "2024-02-29"]);
    expect(points[1]).toMatchObject({ value: 110, invested: 95, partial: true, missing: ["HDFC Liquid"] });
  });

  it("family view sums members month by month; partial if any member is", async () => {
    vi.mocked(dashboardApi.getAggregateSnapshots).mockResolvedValue({ members: [], snapshots: [
      { household_member_id: "a", household_member_name: "A", snapshot_month: "2024-01-31", total_value: "100", invested_value: "90", is_partial: false, missing_scheme_names: [] },
      { household_member_id: "b", household_member_name: "B", snapshot_month: "2024-01-31", total_value: "50", invested_value: "40", is_partial: true, missing_scheme_names: ["X Fund"] },
      { household_member_id: "b", household_member_name: "B", snapshot_month: "2024-02-29", total_value: "60", invested_value: "40", is_partial: false, missing_scheme_names: [] },
    ] });
    const points = await fetchHistory("aggregate", null);
    expect(points).toEqual([
      { month: "2024-01-31", value: 150, invested: 130, partial: true, missing: ["X Fund"] },
      { month: "2024-02-29", value: 60, invested: 40, partial: false, missing: [] },
    ]);
  });

  it("sums money string-exactly before the one display conversion", async () => {
    vi.mocked(dashboardApi.getAggregateSnapshots).mockResolvedValue({ members: [], snapshots: [
      { household_member_id: "a", household_member_name: "A", snapshot_month: "2024-01-31", total_value: "0.10", invested_value: "0.10", is_partial: false, missing_scheme_names: [] },
      { household_member_id: "b", household_member_name: "B", snapshot_month: "2024-01-31", total_value: "0.20", invested_value: "0.20", is_partial: false, missing_scheme_names: [] },
    ] });
    const [point] = await fetchHistory("aggregate", null);
    expect(point.value).toBe(0.3);
    expect(point.invested).toBe(0.3);
  });
});
