import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as historyApi from "@/features/history/api";
import { MobileHistoryView } from "./MobileHistoryView";

vi.mock("@/features/history/api", () => ({ fetchHistory: vi.fn() }));

describe("MobileHistoryView", () => {
  it("shows the history full screen with 1Y/5Y/All and a working Back", async () => {
    vi.mocked(historyApi.fetchHistory).mockResolvedValue([
      { month: "2024-01-31", value: 100, invested: 90, partial: false, missing: [] },
    ]);
    const onBack = vi.fn();
    render(<MobileHistoryView viewMode="member" memberId="m1" memberName="Neha" onBack={onBack} />);
    expect(await screen.findByText("Neha · monthly value at each month-end")).toBeInTheDocument();
    for (const chip of ["1Y", "5Y", "All"]) expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3Y" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
    expect(historyApi.fetchHistory).toHaveBeenCalledWith("member", "m1");
  });
});
