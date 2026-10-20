import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationSection } from "./AllocationSection";
import type { AnalyticsAllocationSummary } from "./types";

const summary: AnalyticsAllocationSummary = {
  total_value: "200000.00",
  by_category: [{ label: "Equity Scheme - Flexi Cap", current_value: "150000.00", percentage: "75" }],
  by_amc: [{ label: "HDFC Mutual Fund", current_value: "150000.00", percentage: "75" }],
};

describe("AllocationSection", () => {
  const varied: AnalyticsAllocationSummary = {
    total_value: "100",
    by_category: [{ label: "Category Large", percentage: "75", current_value: "75" }, { label: "Category Small", percentage: "25", current_value: "25" }],
    by_amc: [{ label: "AMC Large", percentage: "75", current_value: "75" }, { label: "AMC Small", percentage: "25", current_value: "25" }],
  };
  const labels = (prefix: string) => screen.getAllByRole("button", { name: new RegExp(`^${prefix} `) }).map(button => button.getAttribute("aria-label"));

  it.each(["Category", "AMC"])("opens %s smallest first and reverses without changing colours", tab => {
    render(<AllocationSection summary={varied} />);
    fireEvent.click(screen.getByRole("button", { name: `By ${tab}` }));
    expect(labels(tab)).toEqual([`${tab} Small`, `${tab} Large`]);
    const dot = () => screen.getByRole("button", { name: `${tab} Small` }).querySelector("span[aria-hidden]")!.getAttribute("style");
    const colour = dot();
    fireEvent.click(screen.getByRole("button", { name: "Largest first" }));
    expect(labels(tab)).toEqual([`${tab} Large`, `${tab} Small`]);
    expect(dot()).toBe(colour);
  });

  it("prints both lists smallest first without a sort toggle", () => {
    render(<AllocationSection summary={varied} printMode />);
    expect(labels("Category")).toEqual(["Category Small", "Category Large"]);
    expect(labels("AMC")).toEqual(["AMC Small", "AMC Large"]);
    expect(screen.queryByRole("button", { name: "Smallest first" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Largest first" })).toBeNull();
  });
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
