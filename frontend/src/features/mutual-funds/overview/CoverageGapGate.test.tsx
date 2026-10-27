import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import { failedLoad, loaded, loadingLoad } from "../testing";
import type { CoverageGapItem } from "../types";

const mocks = vi.hoisted(() => ({ postOpeningBalance: vi.fn() }));
vi.mock("../../import/api", () => mocks);

import { CoverageGapGate } from "./CoverageGapGate";

function gate(gaps = loaded(fx.coverageGaps()), onResolved = vi.fn()) {
  return { onResolved, gaps, ...render(<CoverageGapGate gaps={gaps} onResolved={onResolved} />) };
}
const units = () => document.getElementById("opening-units") as HTMLInputElement;
const date = () => document.getElementById("opening-date") as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save Opening Balance" }));

beforeEach(() => { mocks.postOpeningBalance.mockReset(); mocks.postOpeningBalance.mockResolvedValue({}); });

describe("CoverageGapGate", () => {
  it("shows nothing while loading, after a failure and when there is no gap", () => {
    for (const gaps of [loadingLoad<CoverageGapItem[]>(), failedLoad<CoverageGapItem[]>(), loaded<CoverageGapItem[]>([])]) {
      const { container, unmount } = gate(gaps);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(container.querySelectorAll("button")).toHaveLength(0);
      unmount();
    }
  });
  it("says how many folios miss earlier purchases", () => {
    const { unmount } = gate();
    expect(screen.getByRole("alert")).toHaveTextContent("Coverage Gap Detected (1 folio missing earlier purchases)");
    unmount();
    const second: CoverageGapItem = { ...fx.coverageGaps()[0], folio_id: "f2", folio_number: "5678" };
    gate(loaded([fx.coverageGaps()[0], second]));
    expect(screen.getByRole("alert")).toHaveTextContent("Coverage Gap Detected (2 folios missing earlier purchases)");
  });
  it("is exempt from the interactivity scan as a legacy part", () => {
    const { container } = gate();
    expect(container.querySelector("[data-legacy]")).not.toBeNull();
  });
  it("opens the opening-balance dialog for the first gap, filled from the gap", () => {
    gate();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Set Opening Balance");
    expect(screen.getByRole("dialog")).toHaveTextContent("Kotak Multi Cap Fund");
    expect(units().value).toBe("10.000");
    expect(date().value).toBe("2024-01-05");
  });
  it("opens the first gap's dialog even when the list is longer", () => {
    const second: CoverageGapItem = { ...fx.coverageGaps()[0], folio_id: "f2", scheme_name: "Second Fund", deficit_units: "99.000", first_deficit_date: "2023-02-02" };
    gate(loaded([fx.coverageGaps()[0], second]));
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    expect(units().value).toBe("10.000");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Second Fund");
  });
  it("posts the opening balance for the folio, then reports it resolved and closes", async () => {
    const { onResolved } = gate();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    fireEvent.change(units(), { target: { value: "12.500" } });
    save();
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    expect(mocks.postOpeningBalance).toHaveBeenCalledTimes(1);
    expect(mocks.postOpeningBalance).toHaveBeenCalledWith("f1", { units: "12.500", date: "2024-01-05", amount: undefined, nav: undefined });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("sends the optional cost amount and NAV when they are filled", async () => {
    gate();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    fireEvent.change(document.getElementById("opening-amount")!, { target: { value: "5000.00" } });
    fireEvent.change(document.getElementById("opening-nav")!, { target: { value: "100.0000" } });
    save();
    await waitFor(() => expect(mocks.postOpeningBalance).toHaveBeenCalledTimes(1));
    expect(mocks.postOpeningBalance).toHaveBeenCalledWith("f1", { units: "10.000", date: "2024-01-05", amount: "5000.00", nav: "100.0000" });
  });
  it("keeps the dialog open and shows the reason when saving fails", async () => {
    mocks.postOpeningBalance.mockRejectedValue(new Error("Opening balance rejected"));
    const { onResolved } = gate();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    save();
    expect(await screen.findByText("Opening balance rejected")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
  it("closes on Cancel without posting, and a reopened dialog starts from the gap again", () => {
    const { onResolved } = gate();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    fireEvent.change(units(), { target: { value: "77.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.postOpeningBalance).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Resolve Gap/ }));
    expect(units().value).toBe("10.000");
  });
});
