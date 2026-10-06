import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SoldFundsSection } from "./SoldFundsSection";
import type { RealizedSummary } from "./types";

const summary: RealizedSummary = {
  total: "-150",
  funds: [
    { scheme_id: "s1", scheme_name: "Franklin Low Duration", household_member_id: "m1", household_member_name: "Rahul",
      plan_type: "direct", realized_gain: "-200", fully_sold: true },
    { scheme_id: "s2", scheme_name: "PPFAS", household_member_id: "m1", household_member_name: "Rahul",
      plan_type: "direct", realized_gain: "50", fully_sold: false },
  ],
};

describe("SoldFundsSection", () => {
  it("shows sold funds with losses, collapsed by default", () => {
    render(<SoldFundsSection summary={summary} />);
    expect(screen.queryByText(/Franklin Low Duration/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sold funds/ }));
    expect(screen.getByText(/Franklin Low Duration/)).toBeInTheDocument();
    expect(screen.queryByText(/PPFAS/)).not.toBeInTheDocument();
    expect(screen.getByText("−₹200")).toBeInTheDocument();
  });

  it("is hidden when no fund is fully sold", () => {
    const { container } = render(<SoldFundsSection summary={{ total: "50", funds: [summary.funds[1]] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("filters to one member when given", () => {
    const other = { ...summary.funds[0], household_member_id: "m2", household_member_name: "Neha", scheme_name: "Old Fund" };
    render(<SoldFundsSection summary={{ total: "0", funds: [summary.funds[0], other] }} memberId="m2" />);
    fireEvent.click(screen.getByRole("button", { name: /Sold funds/ }));
    expect(screen.getByText(/Old Fund/)).toBeInTheDocument();
    expect(screen.queryByText(/Franklin Low Duration/)).not.toBeInTheDocument();
  });
});
