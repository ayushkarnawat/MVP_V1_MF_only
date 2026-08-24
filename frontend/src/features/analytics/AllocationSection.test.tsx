import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationSection } from "./AllocationSection";
import type { AnalyticsAllocationSummary } from "./types";

const summary: AnalyticsAllocationSummary = {
  total_value: "200000.00",
  by_category: [{ label: "Equity Scheme - Flexi Cap", current_value: "150000.00", percentage: "75" }],
  by_amc: [{ label: "HDFC Mutual Fund", current_value: "150000.00", percentage: "75" }],
};

describe("AllocationSection", () => {
  it("printMode shows both category and AMC breakdowns with no tab toggle to click", () => {
    render(<AllocationSection summary={summary} printMode />);

    expect(screen.queryByRole("button", { name: "By Category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "By AMC" })).not.toBeInTheDocument();
    // Both breakdowns visible without any click, unlike the tab-switched default.
    expect(screen.getByText("SEBI Category Distribution")).toBeInTheDocument();
    expect(screen.getByText("Equity Scheme - Flexi Cap")).toBeInTheDocument();
    expect(screen.getByText("Fund House (AMC) Distribution")).toBeInTheDocument();
    expect(screen.getByText("HDFC Mutual Fund")).toBeInTheDocument();
  });

  it("non-printMode still tab-switches, showing only the active tab's data", () => {
    render(<AllocationSection summary={summary} />);

    expect(screen.getByRole("button", { name: "By Category" })).toBeInTheDocument();
    expect(screen.getByText("Equity Scheme - Flexi Cap")).toBeInTheDocument();
    expect(screen.queryByText("HDFC Mutual Fund")).not.toBeInTheDocument();
  });
});
